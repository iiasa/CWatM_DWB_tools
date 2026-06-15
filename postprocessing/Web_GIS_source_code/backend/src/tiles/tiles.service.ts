import { Injectable, Inject, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PG_POOL } from '../database/database.module';
import { Pool } from 'pg';

/**
 * Valid variable names for pixel value queries.
 * Must match the COG directory names in data/tif/cog/.
 */
const VALID_VARIABLES = [
  'discharge',
  'etref',
  'icemelt',
  'rain',
  'runoff',
  'snow',
  'snowfraction',
  'snowmelt',
  'totalet',
  'tws',
  'dem',
  'lulc',
] as const;

export type TileVariable = (typeof VALID_VARIABLES)[number];

/**
 * Static (time-independent) variables. Their COG has no time suffix in the
 * filename (e.g. dem.cog.tif instead of dem_2005-01.cog.tif) and pixel-value
 * queries ignore the `time` parameter.
 */
const STATIC_VARIABLES = new Set<string>(['dem', 'lulc']);

/**
 * NoData / out-of-basin sentinel per variable for pixel-value queries. The
 * float32 layers use -9999; the categorical LULC COG uses Byte 255. Hover
 * queries outside the basin must not surface these as a real class/value.
 */
const VARIABLE_NODATA: Record<string, number> = { lulc: 255 };

const VALID_MVT_LAYERS = [
  'stations',
  'subbasins',
  'rivers',
  'water_bodies',
] as const;
export type MvtLayer = (typeof VALID_MVT_LAYERS)[number];

/** Web Mercator half-circumference in meters */
const WORLD_EXTENT = 20037508.34;

/** MVT cache entry */
interface CacheEntry {
  buffer: Buffer;
  timestamp: number;
}

const MVT_CACHE_TTL = 60 * 60 * 1000; // 1 hour — MVTs are static between data refreshes
const MVT_CACHE_MAX = 8000;

@Injectable()
export class TilesService {
  private readonly logger = new Logger(TilesService.name);
  private readonly titilerInternalUrl: string;
  private readonly titilerPublicUrl: string;
  private readonly mvtCache = new Map<string, CacheEntry>();

  constructor(
    private readonly configService: ConfigService,
    @Inject(PG_POOL) private readonly pool: Pool,
  ) {
    this.titilerInternalUrl =
      this.configService.get<string>('app.titiler.internalUrl') ||
      'http://titiler:8000';
    this.titilerPublicUrl =
      this.configService.get<string>('app.titiler.publicUrl') ||
      'http://localhost:8090';
  }

  /**
   * Check if the given layer name is a valid MVT layer.
   */
  isValidMvtLayer(layer: string): layer is MvtLayer {
    return VALID_MVT_LAYERS.includes(layer as MvtLayer);
  }

  /**
   * Compute Web Mercator bounding box for an XYZ tile.
   */
  private getTileBounds(z: number, x: number, y: number) {
    const tileSize = (2 * WORLD_EXTENT) / Math.pow(2, z);
    return {
      xmin: -WORLD_EXTENT + x * tileSize,
      ymin: WORLD_EXTENT - (y + 1) * tileSize,
      xmax: -WORLD_EXTENT + (x + 1) * tileSize,
      ymax: WORLD_EXTENT - y * tileSize,
    };
  }

  private getCached(key: string): Buffer | null {
    const entry = this.mvtCache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > MVT_CACHE_TTL) {
      this.mvtCache.delete(key);
      return null;
    }
    return entry.buffer;
  }

  private setCache(key: string, buffer: Buffer): void {
    if (this.mvtCache.size >= MVT_CACHE_MAX) {
      const oldest = this.mvtCache.keys().next().value;
      if (oldest) this.mvtCache.delete(oldest);
    }
    this.mvtCache.set(key, { buffer, timestamp: Date.now() });
  }

  /**
   * Generate MVT tile for subbasins layer.
   */
  async getSubbasinsMvt(z: number, x: number, y: number): Promise<Buffer> {
    const cacheKey = `subbasins_${z}_${x}_${y}`;
    const cached = this.getCached(cacheKey);
    if (cached) return cached;

    const { xmin, ymin, xmax, ymax } = this.getTileBounds(z, x, y);

    // At low zoom, render the pre-simplified polygon column. At ~500 m tolerance
    // the difference is invisible at z < 8 but the vertex count is a fraction
    // of the full geometry, making ST_AsMVTGeom + the GIST intersect much
    // cheaper. The generated column falls back transparently to the full
    // geometry if the column hasn't been created yet (see COALESCE below).
    const geomCol = z < 8 ? 'COALESCE(geom_simplified, geom)' : 'geom';

    const { rows } = await this.pool.query(
      `SELECT ST_AsMVT(tile, 'subbasins', 4096, 'geom') AS mvt
       FROM (
         SELECT
           ST_AsMVTGeom(
             ST_Transform(${geomCol}, 3857),
             ST_MakeEnvelope($1, $2, $3, $4, 3857),
             4096, 256, true
           ) AS geom,
           id, "Subbasin", "Station", "River", "Country",
           lat, lon, area, "KGE_cal", "KGE_val"
         FROM subbasins
         WHERE ${geomCol} IS NOT NULL
           AND ST_Intersects(
             ${geomCol},
             ST_Transform(ST_MakeEnvelope($1, $2, $3, $4, 3857), 4326)
           )
       ) AS tile
       WHERE geom IS NOT NULL`,
      [xmin, ymin, xmax, ymax],
    );

    const mvt = rows[0]?.mvt ?? Buffer.alloc(0);
    this.setCache(cacheKey, mvt);
    return mvt;
  }

  /**
   * Generate MVT tile for stations layer.
   */
  async getStationsMvt(z: number, x: number, y: number): Promise<Buffer> {
    const cacheKey = `stations_${z}_${x}_${y}`;
    const cached = this.getCached(cacheKey);
    if (cached) return cached;

    const { xmin, ymin, xmax, ymax } = this.getTileBounds(z, x, y);

    const { rows } = await this.pool.query(
      `SELECT ST_AsMVT(tile, 'stations', 4096, 'geom') AS mvt
       FROM (
         SELECT
           ST_AsMVTGeom(
             ST_Transform(geom, 3857),
             ST_MakeEnvelope($1, $2, $3, $4, 3857),
             4096, 256, true
           ) AS geom,
           id, "Subbasin", "Station", "River", "Country",
           lat, lon, "Provider", "KGE_cal", "KGE_val"
         FROM calib_stations
         WHERE geom IS NOT NULL
           AND ST_Intersects(
             geom,
             ST_Transform(ST_MakeEnvelope($1, $2, $3, $4, 3857), 4326)
           )
       ) AS tile
       WHERE geom IS NOT NULL`,
      [xmin, ymin, xmax, ymax],
    );

    const mvt = rows[0]?.mvt ?? Buffer.alloc(0);
    this.setCache(cacheKey, mvt);
    return mvt;
  }

  /**
   * Minimum Strahler order to show at a given zoom. The rivers table holds the
   * full Danube network (ORD_STRA >= 1); this is what gates how much of it is
   * revealed per zoom — smaller rivers appear as the user zooms in. Tuned so
   * z<=8 keeps the original look (order >= 5/6) and max zoom shows everything.
   */
  private riversMinOrderForZoom(z: number): number {
    if (z <= 6) return 6;  // very zoomed out — only the biggest rivers
    if (z <= 8) return 5;  // original default appearance
    if (z <= 10) return 4;
    if (z <= 12) return 3;
    if (z <= 13) return 2;
    return 1;              // z >= 14 — small headwater streams included
  }

  /**
   * Generate MVT tile for the rivers layer (HydroRIVERS, clipped to the basin).
   *
   * The table holds all orders; riversMinOrderForZoom(z) filters by stream order
   * so the network densifies as the user zooms in. ord_stra also drives line
   * width on the frontend.
   */
  async getRiversMvt(z: number, x: number, y: number): Promise<Buffer> {
    const cacheKey = `rivers_${z}_${x}_${y}`;
    const cached = this.getCached(cacheKey);
    if (cached) return cached;

    const { xmin, ymin, xmax, ymax } = this.getTileBounds(z, x, y);

    const minOrder = this.riversMinOrderForZoom(z);

    const { rows } = await this.pool.query(
      `SELECT ST_AsMVT(tile, 'rivers', 4096, 'geom') AS mvt
       FROM (
         SELECT
           ST_AsMVTGeom(
             ST_Transform(geom, 3857),
             ST_MakeEnvelope($1, $2, $3, $4, 3857),
             4096, 256, true
           ) AS geom,
           id, hyriv_id, ord_stra, ord_flow, dis_av_cms
         FROM rivers
         WHERE geom IS NOT NULL
           AND ord_stra >= $5
           AND ST_Intersects(
             geom,
             ST_Transform(ST_MakeEnvelope($1, $2, $3, $4, 3857), 4326)
           )
       ) AS tile
       WHERE geom IS NOT NULL`,
      [xmin, ymin, xmax, ymax, minOrder],
    );

    const mvt = rows[0]?.mvt ?? Buffer.alloc(0);
    this.setCache(cacheKey, mvt);
    return mvt;
  }

  /**
   * Generate MVT tile for the water_bodies layer (HydroLAKES, clipped to the
   * basin). Polygons (lakes + reservoirs); lake_type distinguishes them.
   */
  async getWaterBodiesMvt(z: number, x: number, y: number): Promise<Buffer> {
    const cacheKey = `water_bodies_${z}_${x}_${y}`;
    const cached = this.getCached(cacheKey);
    if (cached) return cached;

    const { xmin, ymin, xmax, ymax } = this.getTileBounds(z, x, y);

    const { rows } = await this.pool.query(
      `SELECT ST_AsMVT(tile, 'water_bodies', 4096, 'geom') AS mvt
       FROM (
         SELECT
           ST_AsMVTGeom(
             ST_Transform(geom, 3857),
             ST_MakeEnvelope($1, $2, $3, $4, 3857),
             4096, 256, true
           ) AS geom,
           id, hylak_id, lake_name, lake_type, lake_area
         FROM water_bodies
         WHERE geom IS NOT NULL
           AND ST_Intersects(
             geom,
             ST_Transform(ST_MakeEnvelope($1, $2, $3, $4, 3857), 4326)
           )
       ) AS tile
       WHERE geom IS NOT NULL`,
      [xmin, ymin, xmax, ymax],
    );

    const mvt = rows[0]?.mvt ?? Buffer.alloc(0);
    this.setCache(cacheKey, mvt);
    return mvt;
  }

  /**
   * Get MVT tile for a given layer.
   */
  async getMvt(layer: MvtLayer, z: number, x: number, y: number): Promise<Buffer> {
    switch (layer) {
      case 'subbasins':
        return this.getSubbasinsMvt(z, x, y);
      case 'stations':
        return this.getStationsMvt(z, x, y);
      case 'rivers':
        return this.getRiversMvt(z, x, y);
      case 'water_bodies':
        return this.getWaterBodiesMvt(z, x, y);
    }
  }

  /**
   * Check if the given variable name is valid.
   */
  isValidVariable(variable: string): variable is TileVariable {
    return VALID_VARIABLES.includes(variable as TileVariable);
  }

  /**
   * Check if the given variable is a static (time-independent) layer.
   */
  isStaticVariable(variable: string): boolean {
    return STATIC_VARIABLES.has(variable);
  }

  /**
   * Build the COG file URL for a variable. Static variables have no time suffix.
   */
  private buildCogUrl(variable: string, time?: string): string {
    if (this.isStaticVariable(variable)) {
      return `file:///data/cog/${variable}/${variable}.cog.tif`;
    }
    return `file:///data/cog/${variable}/${variable}_${time}.cog.tif`;
  }

  /**
   * Get TiTiler configuration for the frontend.
   * Returns the public TiTiler URL and COG path patterns.
   */
  getTitilerConfig() {
    return {
      baseUrl: this.titilerPublicUrl,
      tilePattern: '/cog/tiles/WebMercatorQuad/{z}/{x}/{y}.png',
      variables: VALID_VARIABLES.map((key) => ({
        key,
        cogPattern: this.isStaticVariable(key)
          ? `file:///data/cog/${key}/${key}.cog.tif`
          : `file:///data/cog/${key}/${key}_{time}.cog.tif`,
        colormapName: `dwb_${key}`,
        static: this.isStaticVariable(key),
      })),
    };
  }

  /**
   * Get the pixel value from a COG file via TiTiler's point query endpoint.
   *
   * @param variable - Variable key (e.g., 'discharge', 'rain')
   * @param time - Time in YYYY-MM format (e.g., '2005-01')
   * @param lat - Latitude in WGS84
   * @param lon - Longitude in WGS84
   * @returns The pixel value or null if nodata/out-of-bounds
   */
  async getPixelValue(
    variable: string,
    time: string | undefined,
    lat: number,
    lon: number,
  ): Promise<number | null> {
    try {
      const cogUrl = this.buildCogUrl(variable, time);
      const titilerUrl = `${this.titilerInternalUrl}/cog/point/${lon},${lat}?url=${encodeURIComponent(cogUrl)}`;

      const response = await fetch(titilerUrl, {
        signal: AbortSignal.timeout(10_000),
      });

      if (!response.ok) {
        this.logger.warn(
          `TiTiler returned ${response.status} for ${variable} at ${time} (${lat}, ${lon})`,
        );
        return null;
      }

      const data = await response.json();

      // TiTiler returns { coordinates: [lon, lat], values: [value], band_names: [...] }
      const value = data.values?.[0];

      // Filter out nodata: the float32 layers use -9999, LULC uses Byte 255.
      const nodata = VARIABLE_NODATA[variable] ?? -9999;
      if (value === null || value === undefined || value === nodata) {
        return null;
      }

      return value;
    } catch (error: any) {
      this.logger.warn(
        `Failed to get pixel value for ${variable} at ${time} (${lat}, ${lon}): ${error?.message}`,
      );
      return null;
    }
  }
}
