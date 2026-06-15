import {
  Controller,
  Get,
  Header,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  ParseIntPipe,
  ParseFloatPipe,
  ValidationPipe,
  UsePipes,
} from '@nestjs/common';
import { CalibStationsService } from './calib-stations.service';
import { CreateCalibStationDto, UpdateCalibStationDto } from './dto';
import { CalibStation } from './entities/calib-station.entity';

@Controller('calib-stations')
@UsePipes(new ValidationPipe({ transform: true }))
export class CalibStationsController {
  constructor(private readonly calibStationsService: CalibStationsService) {}

  @Post()
  create(@Body() createCalibStationDto: CreateCalibStationDto): Promise<CalibStation> {
    return this.calibStationsService.create(createCalibStationDto);
  }

  @Get()
  @Header('Cache-Control', 'public, max-age=300, s-maxage=600')
  findAll(): Promise<CalibStation[]> {
    return this.calibStationsService.findAll();
  }

  @Get('statistics')
  @Header('Cache-Control', 'public, max-age=300, s-maxage=600')
  getStatistics() {
    return this.calibStationsService.getStatistics();
  }

  @Get('count')
  @Header('Cache-Control', 'public, max-age=300, s-maxage=600')
  getCount(): Promise<number> {
    return this.calibStationsService.count();
  }

  @Get('by-subbasin/:subbasin')
  @Header('Cache-Control', 'public, max-age=300')
  findBySubbasin(@Param('subbasin') subbasin: string): Promise<CalibStation[]> {
    return this.calibStationsService.findBySubbasin(subbasin);
  }

  @Get('by-country/:country')
  @Header('Cache-Control', 'public, max-age=300')
  findByCountry(@Param('country') country: string): Promise<CalibStation[]> {
    return this.calibStationsService.findByCountry(country);
  }

  @Get('by-provider/:provider')
  @Header('Cache-Control', 'public, max-age=300')
  findByProvider(@Param('provider') provider: string): Promise<CalibStation[]> {
    return this.calibStationsService.findByProvider(provider);
  }

  @Get('by-station')
  @Header('Cache-Control', 'public, max-age=300')
  findByStationName(@Query('name') stationName: string): Promise<CalibStation[]> {
    return this.calibStationsService.findByStationName(stationName);
  }

  @Get('by-river')
  @Header('Cache-Control', 'public, max-age=300')
  findByRiver(@Query('name') river: string): Promise<CalibStation[]> {
    return this.calibStationsService.findByRiver(river);
  }

  @Get('by-location')
  findByLocation(
    @Query('lat', ParseFloatPipe) lat: number,
    @Query('lon', ParseFloatPipe) lon: number,
    @Query('radius', ParseFloatPipe) radiusKm?: number,
  ): Promise<CalibStation[]> {
    return this.calibStationsService.findByLocation(lat, lon, radiusKm);
  }

  @Get('by-performance')
  findByPerformanceMetrics(
    @Query('minKGE', ParseFloatPipe) minKGE?: number,
    @Query('minNSE', ParseFloatPipe) minNSE?: number,
    @Query('metricType') metricType?: 'cal' | 'val',
  ): Promise<CalibStation[]> {
    return this.calibStationsService.findByPerformanceMetrics(
      minKGE,
      minNSE,
      metricType || 'cal',
    );
  }

  @Post('selected')
  async handleSelectedStation(@Body() stationData: any): Promise<{ message: string; received: any }> {
    return {
      message: 'Station selection received successfully',
      received: stationData,
    };
  }

  @Get('graph/:stationName')
  getStationGraph(@Param('stationName') stationName: string): Promise<any> {
    return this.calibStationsService.getGraphData(stationName);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number): Promise<CalibStation> {
    return this.calibStationsService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateCalibStationDto: UpdateCalibStationDto,
  ): Promise<CalibStation> {
    return this.calibStationsService.update(id, updateCalibStationDto);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.calibStationsService.remove(id);
  }
}
