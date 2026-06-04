import { Inject, Injectable, Logger } from '@nestjs/common';
import { Pool } from 'pg';
import * as path from 'path';
import * as fs from 'fs';
import { PG_POOL } from '../database/database.module';
import { PythonProcessService } from '../common/services/python-process.service';

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

@Injectable()
export class SubbasinsService {
  private readonly logger = new Logger(SubbasinsService.name);

  // In-memory TTL kes - 5 minuta, max 500 unosa
  private readonly cache = new Map<string, CacheEntry<any>>();
  private static readonly CACHE_TTL = 5 * 60 * 1000;
  private static readonly MAX_CACHE_SIZE = 500;

  // Tri-state: null = unknown, true = subbasin_upstream populated, false = absent/empty.
  // Set on first lookup so a TRUNCATE'd or missing closure table cleanly falls back
  // to the recursive CTE instead of returning false negatives.
  private closureTableReady: boolean | null = null;

  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    private readonly pythonProcess: PythonProcessService,
  ) {}

  private async isClosureTableReady(): Promise<boolean> {
    if (this.closureTableReady !== null) return this.closureTableReady;
    try {
      const r = await this.pool.query(
        'SELECT EXISTS (SELECT 1 FROM public.subbasin_upstream LIMIT 1) AS ready',
      );
      this.closureTableReady = r.rows[0]?.ready === true;
    } catch {
      this.closureTableReady = false;
    }
    return this.closureTableReady;
  }

  private getCached<T>(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;
    if (Date.now() - entry.timestamp > SubbasinsService.CACHE_TTL) {
      this.cache.delete(key);
      return undefined;
    }
    return entry.data as T;
  }

  private setCache<T>(key: string, data: T): void {
    if (this.cache.size >= SubbasinsService.MAX_CACHE_SIZE) {
      const oldest = this.cache.keys().next().value;
      this.cache.delete(oldest);
    }
    this.cache.set(key, { data, timestamp: Date.now() });
  }

  async findAllRaw(limit?: number, offset?: number, geomAs: 'geojson' | 'wkt' = 'geojson') {
    const cacheKey = `findAllRaw_${limit}_${offset}_${geomAs}`;
    const cached = this.getCached<any[]>(cacheKey);
    if (cached) return cached;

    const geomExpr = geomAs === 'geojson' ? 'ST_AsGeoJSON("geom") AS "geom"' : 'ST_AsText("geom") AS "geom"';

    const sql = `
      SELECT
        "id",
        ${geomExpr},
        "gridcode", "no", "Subbasin", "Idall", "ID_numeric", "ID_2",
        "Provider", "River", "Station", "Country", "lat", "lon",
        "DrainArPro", "DrainArLDD", "EnoughQdat",
        "Val_Start", "Val_End", "Cal_Start", "Cal_End",
        "CatchmentA", "area", "SamplingFr", "Inflow", "Inflow_ID",
        "KGE_cal", "KGE_val", "NSE_cal", "NSE_val",
        "merged_ids", "ID"
      FROM "subbasins"
      ${Number.isFinite(limit) ? 'LIMIT $1' : ''}
      ${Number.isFinite(offset) ? 'OFFSET $2' : ''}
    `;

    const params: any[] = [];
    if (Number.isFinite(limit)) params.push(limit);
    if (Number.isFinite(offset)) params.push(offset);

    const res = await this.pool.query(sql, params);
    if (geomAs === 'geojson') {
      for (const r of res.rows) {
        if (typeof r.geom === 'string') r.geom = JSON.parse(r.geom);
      }
    }

    this.setCache(cacheKey, res.rows);
    return res.rows;
  }

  // Thin per-subbasin catalog without geometry. Geometry is served via MVT tiles
  // so the UI doesn't need ST_AsGeoJSON on every page load.
  async findCatalog(): Promise<
    Array<{
      id: number;
      Subbasin: string | null;
      ID_2: string | null;
      Country: string | null;
      River: string | null;
      Station: string | null;
      lat: number | null;
      lon: number | null;
    }>
  > {
    const cacheKey = 'catalog_v1';
    const cached = this.getCached<any[]>(cacheKey);
    if (cached) return cached;

    // lat/lon columns in the table are sparsely populated, so fall back to
    // the polygon centroid. Cheap on 645 rows and gives the frontend a usable
    // point for bbox/marker rendering.
    const sql = `
      SELECT
        "id",
        "Subbasin",
        "ID_2",
        "Country",
        "River",
        "Station",
        COALESCE("lat", ST_Y(ST_Centroid("geom"))) AS "lat",
        COALESCE("lon", ST_X(ST_Centroid("geom"))) AS "lon"
      FROM "subbasins"
      ORDER BY "id"
    `;
    const res = await this.pool.query(sql);
    this.setCache(cacheKey, res.rows);
    return res.rows;
  }

  async findAllAsFeatureCollection(limit?: number, offset?: number) {
    const cacheKey = `featureCollection_${limit}_${offset}`;
    const cached = this.getCached<any>(cacheKey);
    if (cached) return cached;

    const sql = `
      WITH src AS (
        SELECT
          "id",
          "gridcode", "no", "Subbasin", "Idall", "ID_numeric", "ID_2",
          "Provider", "River", "Station", "Country", "lat", "lon",
          "DrainArPro", "DrainArLDD", "EnoughQdat",
          "Val_Start", "Val_End", "Cal_Start", "Cal_End",
          "CatchmentA", "area", "SamplingFr", "Inflow", "Inflow_ID",
          "KGE_cal", "KGE_val", "NSE_cal", "NSE_val",
          "merged_ids", "ID",
          "geom"
        FROM "subbasins"
        ${Number.isFinite(limit) ? 'LIMIT $1' : ''}
        ${Number.isFinite(offset) ? 'OFFSET $2' : ''}
      )
      SELECT jsonb_build_object(
        'type','FeatureCollection',
        'features', COALESCE(jsonb_agg(
          jsonb_build_object(
            'type','Feature',
            'geometry', ST_AsGeoJSON("geom")::jsonb,
            'properties', to_jsonb(src) - 'geom'
          )
        ), '[]'::jsonb)
      ) AS fc
      FROM src;
    `;
    const params: any[] = [];
    if (Number.isFinite(limit)) params.push(limit);
    if (Number.isFinite(offset)) params.push(offset);

    const res = await this.pool.query(sql, params);
    const result = res.rows[0]?.fc ?? { type: 'FeatureCollection', features: [] };

    this.setCache(cacheKey, result);
    return result;
  }

  // Returns the transitive set of upstream subbasin ids for the given root id.
  // Inflow_ID is a space-separated list of geocodes; each geocode resolves to one
  // or more subbasin rows via the ID_2 column. The CTE uses UNION (not UNION ALL)
  // so step-wise deduplication keeps the working set bounded and naturally halts
  // on cycles — once an id is in the CTE, the recursive term cannot re-add it.
  async getUpstreamSubbasinIds(id: number): Promise<{
    root: number;
    upstream_ids: number[];
    count: number;
    truncated: boolean;
  }> {
    const cacheKey = `upstream_${id}`;
    const cached = this.getCached<{
      root: number;
      upstream_ids: number[];
      count: number;
      truncated: boolean;
    }>(cacheKey);
    if (cached) return cached;

    // Fast path: closure table built once at seed time (06-create-indexes.sql).
    // O(1) indexed lookup vs. the recursive CTE's repeated table scans.
    if (await this.isClosureTableReady()) {
      try {
        const res = await this.pool.query(
          'SELECT ancestor_id FROM public.subbasin_upstream WHERE subbasin_id = $1',
          [id],
        );
        const ids = res.rows.map((r) => Number(r.ancestor_id));
        const result = { root: id, upstream_ids: ids, count: ids.length, truncated: false };
        this.setCache(cacheKey, result);
        return result;
      } catch (err) {
        // Table disappeared between the EXISTS probe and now — fall through to CTE.
        this.logger.warn(
          `subbasin_upstream query failed, falling back to recursive CTE: ${err instanceof Error ? err.message : String(err)}`,
        );
        this.closureTableReady = false;
      }
    }

    // The geocode in Inflow_ID is NOT unique across the dataset — the same code
    // (e.g. 'G0037') is reused as ID_2 by ~4 subbasins in different regions
    // (Upper, Drava, Tisa…). Only the same-region match is the true hydrological
    // parent within a group. Cross-group hops (e.g. Sava outlet → Lower Danube)
    // are encoded explicitly by primary key in subbasin_cross_group_links so the
    // recursion can traverse the whole Danube system without geocode ambiguity.
    const sql = `
      WITH RECURSIVE upstream(id, "Subbasin", "Inflow_ID") AS (
        SELECT s.id, s."Subbasin", s."Inflow_ID"
        FROM subbasins s
        WHERE s.id = $1

        UNION

        SELECT n.id, n."Subbasin", n."Inflow_ID"
        FROM upstream u
        JOIN subbasins n ON n.id IN (
          SELECT next_s.id
          FROM unnest(string_to_array(u."Inflow_ID", ' ')) AS gc
          JOIN subbasins next_s
            ON next_s."ID_2" = trim(gc)
           AND next_s."Subbasin" = u."Subbasin"
          WHERE trim(gc) <> ''

          UNION

          SELECT l.upstream_subbasin_id
          FROM subbasin_cross_group_links l
          WHERE l.downstream_subbasin_id = u.id
        )
      )
      SELECT id FROM upstream WHERE id <> $1;
    `;

    try {
      const res = await this.pool.query(sql, [id]);
      const ids = res.rows.map((r) => Number(r.id));
      const result = { root: id, upstream_ids: ids, count: ids.length, truncated: false };
      this.setCache(cacheKey, result);
      return result;
    } catch (error) {
      this.logger.error(`Error computing upstream for subbasin ${id}`, error);
      throw error;
    }
  }

  async getSubbasinParquetData(subbasinId: string) {
    const parquetDir = path.join(__dirname, '..', '..', '..', 'data', 'subbasins');
    const fileName = `subbasin_${subbasinId}.parquet`;
    const parquetFilePath = path.join(parquetDir, fileName);

    let fileSize = null;
    if (fs.existsSync(parquetFilePath)) {
      const stats = fs.statSync(parquetFilePath);
      fileSize = stats.size;
    }

    return {
      success: true,
      subbasinId: subbasinId,
      fileName: fileName,
      filePath: parquetFilePath,
      fileSize: fileSize,
      exists: fs.existsSync(parquetFilePath),
      message: `Parquet file ${fileName} selected`,
    };
  }

  /**
   * Dobij graph podatke za subbasin putem Python skripte.
   * Koristi execFile umesto exec za bezbednost (bez shell interpolacije).
   */
  async getGraphData(subbasinId: string): Promise<any> {
    // Validacija ID-a - dozvoljeni samo alfanumericki karakteri, _ i -
    if (!/^[\w-]+$/.test(subbasinId)) {
      return { error: 'Invalid subbasin ID format', subbasin_id: subbasinId };
    }

    const scriptPath = path.join(__dirname, '..', '..', 'python', 'get_subbasin_data.py');
    this.logger.log(`Graph data for subbasin: ${subbasinId}`);

    try {
      const stdout = await this.pythonProcess.execScript(scriptPath, [
        '--subbasin_id',
        subbasinId,
      ]);

      if (stdout.trim() === 'null' || !stdout.trim()) {
        return { error: 'No data found for subbasin', subbasin_id: subbasinId };
      }

      return JSON.parse(stdout.trim());
    } catch (error) {
      this.logger.error(`Error getting subbasin graph ${subbasinId}`, error);
      return {
        error: 'Failed to get graph data',
        message: error.message,
      };
    }
  }
}
