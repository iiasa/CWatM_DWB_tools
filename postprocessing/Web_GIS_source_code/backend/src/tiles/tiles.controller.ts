import {
  Controller,
  Get,
  Param,
  Query,
  Res,
  BadRequestException,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Response } from 'express';
import { TilesService } from './tiles.service';

// NestJS throttler gotcha: when ThrottlerModule is configured with named
// throttlers (e.g. "short", "long"), `@SkipThrottle()` with no arguments does
// NOT skip them — each named throttler must be opted out explicitly.
// Without this, OpenLayers' zoom-level MVT bursts get 429 Too Many Requests.
@SkipThrottle({ short: true, long: true })
@Controller('tiles')
export class TilesController {
  constructor(private readonly tilesService: TilesService) {}

  /**
   * Serve MVT (Mapbox Vector Tile) for a given layer.
   *
   * GET /tiles/mvt/:layer/:z/:x/:y.pbf
   */
  @Get('mvt/:layer/:z/:x/:y.pbf')
  async getMvt(
    @Param('layer') layer: string,
    @Param('z') zStr: string,
    @Param('x') xStr: string,
    @Param('y') yStr: string,
    @Res() res: Response,
  ) {
    if (!this.tilesService.isValidMvtLayer(layer)) {
      throw new BadRequestException(
        `Invalid layer: ${layer}. Valid options: stations, subbasins, rivers, water_bodies`,
      );
    }

    const z = parseInt(zStr, 10);
    const x = parseInt(xStr, 10);
    // y comes as "11" (NestJS strips .pbf from the route param)
    const y = parseInt(yStr, 10);

    if (isNaN(z) || isNaN(x) || isNaN(y) || z < 0 || x < 0 || y < 0) {
      throw new BadRequestException('z, x, y must be non-negative integers');
    }

    const mvt = await this.tilesService.getMvt(layer, z, x, y);

    if (!mvt || mvt.length === 0) {
      res.status(204).end();
      return;
    }

    res.set({
      'Content-Type': 'application/x-protobuf',
      'Cache-Control': 'public, max-age=3600, s-maxage=86400, immutable',
    });
    res.send(mvt);
  }

  /**
   * Return TiTiler configuration for the frontend.
   * Includes the public URL, tile pattern, and per-variable COG path patterns.
   *
   * GET /tiles/titiler-config
   */
  @Get('titiler-config')
  getTitilerConfig() {
    return this.tilesService.getTitilerConfig();
  }

  /**
   * Get the pixel value from a COG file via TiTiler for hover tooltip values.
   *
   * GET /tiles/value?variable=discharge&time=2005-01&lat=46.5&lon=22.3
   */
  @Get('value')
  async getPixelValue(
    @Query('variable') variable: string,
    @Query('time') time: string,
    @Query('lat') lat: string,
    @Query('lon') lon: string,
  ) {
    // Validate variable name first so we know whether `time` is required.
    if (!this.tilesService.isValidVariable(variable)) {
      throw new BadRequestException(
        `Invalid variable: ${variable}. Valid options: discharge, etref, icemelt, rain, runoff, snow, snowfraction, snowmelt, totalet, tws, dem, lulc`,
      );
    }

    const isStatic = this.tilesService.isStaticVariable(variable);

    // `time` is required for time-series layers but ignored for static layers (e.g. dem).
    if (!variable || !lat || !lon || (!isStatic && !time)) {
      throw new BadRequestException(
        isStatic
          ? 'Missing required query parameters: variable, lat, lon'
          : 'Missing required query parameters: variable, time, lat, lon',
      );
    }

    // Validate time format (YYYY-MM) only for time-series layers.
    if (!isStatic && !/^\d{4}-\d{2}$/.test(time)) {
      throw new BadRequestException(
        'Invalid time format. Expected YYYY-MM (e.g., 2005-01)',
      );
    }

    const latNum = parseFloat(lat);
    const lonNum = parseFloat(lon);

    if (isNaN(latNum) || isNaN(lonNum)) {
      throw new BadRequestException('lat and lon must be valid numbers');
    }

    const value = await this.tilesService.getPixelValue(
      variable,
      time,
      latNum,
      lonNum,
    );

    return {
      variable,
      time,
      lat: latNum,
      lon: lonNum,
      value,
    };
  }
}
