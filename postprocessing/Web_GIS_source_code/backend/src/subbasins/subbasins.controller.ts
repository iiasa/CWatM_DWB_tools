import { Controller, Get, Header, Query, Param, ParseIntPipe } from '@nestjs/common';
import { SubbasinsService } from './subbasins.service';

@Controller('subbasins')
export class SubbasinsController {
  constructor(private readonly svc: SubbasinsService) {}

  @Get()
  async getRaw(
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('geomAs') geomAs: 'geojson' | 'wkt' = 'geojson',
  ) {
    const l = limit ? parseInt(limit, 10) : undefined;
    const o = offset ? parseInt(offset, 10) : undefined;
    return this.svc.findAllRaw(l, o, geomAs);
  }

  @Get('geojson')
  @Header('Cache-Control', 'public, max-age=300, s-maxage=600')
  async getGeoJSON(@Query('limit') limit?: string, @Query('offset') offset?: string) {
    const l = limit ? parseInt(limit, 10) : undefined;
    const o = offset ? parseInt(offset, 10) : undefined;
    return this.svc.findAllAsFeatureCollection(l, o);
  }

  // Thin catalog: id + label fields only, no geometry. Use this for dropdowns
  // and list views; geometry is delivered via MVT tiles. Cheap (<100 KB) and
  // safe to cache aggressively.
  @Get('catalog')
  @Header('Cache-Control', 'public, max-age=600, s-maxage=600')
  getCatalog() {
    return this.svc.findCatalog();
  }

  @Get('parquet/:subbasinId')
  async getSubbasinParquetData(@Param('subbasinId') subbasinId: string) {
    return this.svc.getSubbasinParquetData(subbasinId);
  }

  @Get('graph/:subbasinId')
  getSubbasinGraph(@Param('subbasinId') subbasinId: string): Promise<any> {
    return this.svc.getGraphData(subbasinId);
  }

  @Get(':id/upstream')
  @Header('Cache-Control', 'public, max-age=600, s-maxage=600')
  getUpstream(@Param('id', ParseIntPipe) id: number) {
    return this.svc.getUpstreamSubbasinIds(id);
  }
}
