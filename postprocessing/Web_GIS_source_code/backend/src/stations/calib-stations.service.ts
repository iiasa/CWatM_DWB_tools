import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindManyOptions, FindOneOptions } from 'typeorm';
import * as path from 'path';
import { CalibStation } from './entities/calib-station.entity';
import { CreateCalibStationDto, UpdateCalibStationDto } from './dto';
import { PythonProcessService } from '../common/services/python-process.service';

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

@Injectable()
export class CalibStationsService {
  private readonly logger = new Logger(CalibStationsService.name);

  // In-memory TTL kes - 5 minuta, max 500 unosa, LRU eviction
  private readonly cache = new Map<string, CacheEntry<any>>();
  private static readonly CACHE_TTL = 5 * 60 * 1000;
  private static readonly MAX_CACHE_SIZE = 500;

  constructor(
    @InjectRepository(CalibStation)
    private readonly calibStationRepository: Repository<CalibStation>,
    private readonly pythonProcess: PythonProcessService,
  ) {}

  private getCached<T>(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;
    if (Date.now() - entry.timestamp > CalibStationsService.CACHE_TTL) {
      this.cache.delete(key);
      return undefined;
    }
    return entry.data as T;
  }

  private setCache<T>(key: string, data: T): void {
    if (this.cache.size >= CalibStationsService.MAX_CACHE_SIZE) {
      // LRU: obrisi najstariji unos
      const oldest = this.cache.keys().next().value;
      this.cache.delete(oldest);
    }
    this.cache.set(key, { data, timestamp: Date.now() });
  }

  private clearCache(): void {
    this.cache.clear();
  }

  async create(createCalibStationDto: CreateCalibStationDto): Promise<CalibStation> {
    const calibStation = this.calibStationRepository.create(createCalibStationDto);
    this.clearCache();
    return await this.calibStationRepository.save(calibStation);
  }

  async findAll(options?: FindManyOptions<CalibStation>): Promise<CalibStation[]> {
    const cacheKey = `findAll_${JSON.stringify(options ?? {})}`;
    const cached = this.getCached<CalibStation[]>(cacheKey);
    if (cached) return cached;

    const result = await this.calibStationRepository.find(options);
    this.setCache(cacheKey, result);
    return result;
  }

  async findOne(id: number, options?: FindOneOptions<CalibStation>): Promise<CalibStation> {
    const calibStation = await this.calibStationRepository.findOne({
      where: { id },
      ...options,
    });

    if (!calibStation) {
      throw new NotFoundException(`CalibStation with ID ${id} not found`);
    }

    return calibStation;
  }

  async findBySubbasin(subbasin: string): Promise<CalibStation[]> {
    return await this.calibStationRepository.find({
      where: { Subbasin: subbasin },
    });
  }

  async findByCountry(country: string): Promise<CalibStation[]> {
    return await this.calibStationRepository.find({
      where: { Country: country },
    });
  }

  async findByProvider(provider: string): Promise<CalibStation[]> {
    return await this.calibStationRepository.find({
      where: { Provider: provider },
    });
  }

  async findByStationName(stationName: string): Promise<CalibStation[]> {
    return await this.calibStationRepository
      .createQueryBuilder('calibStation')
      .where('LOWER(calibStation.Station) LIKE LOWER(:stationName)', {
        stationName: `%${stationName}%`,
      })
      .getMany();
  }

  async findByRiver(river: string): Promise<CalibStation[]> {
    return await this.calibStationRepository
      .createQueryBuilder('calibStation')
      .where('LOWER(calibStation.River) LIKE LOWER(:river)', {
        river: `%${river}%`,
      })
      .getMany();
  }

  async findByLocation(lat: number, lon: number, radiusKm: number = 10): Promise<CalibStation[]> {
    const cacheKey = `findByLocation_${lat}_${lon}_${radiusKm}`;
    const cached = this.getCached<CalibStation[]>(cacheKey);
    if (cached) return cached;

    const result = await this.calibStationRepository
      .createQueryBuilder('calibStation')
      .where(
        'ST_DWithin(calibStation.geom, ST_SetSRID(ST_MakePoint(:lon, :lat), 4326), :radius)',
        {
          lat,
          lon,
          radius: radiusKm * 1000,
        },
      )
      .getMany();

    this.setCache(cacheKey, result);
    return result;
  }

  async findByPerformanceMetrics(
    minKGE?: number,
    minNSE?: number,
    metricType: 'cal' | 'val' = 'cal',
  ): Promise<CalibStation[]> {
    const queryBuilder = this.calibStationRepository.createQueryBuilder('calibStation');

    if (minKGE !== undefined) {
      const kgeField = metricType === 'cal' ? 'KGE_cal' : 'KGE_val';
      queryBuilder.andWhere(`calibStation.${kgeField} >= :minKGE`, { minKGE });
    }

    if (minNSE !== undefined) {
      const nseField = metricType === 'cal' ? 'NSE_cal' : 'NSE_val';
      queryBuilder.andWhere(`calibStation.${nseField} >= :minNSE`, { minNSE });
    }

    return await queryBuilder.getMany();
  }

  async update(id: number, updateCalibStationDto: UpdateCalibStationDto): Promise<CalibStation> {
    const calibStation = await this.findOne(id);
    Object.assign(calibStation, updateCalibStationDto);
    this.clearCache();
    return await this.calibStationRepository.save(calibStation);
  }

  async remove(id: number): Promise<void> {
    const calibStation = await this.findOne(id);
    this.clearCache();
    await this.calibStationRepository.remove(calibStation);
  }

  async count(): Promise<number> {
    return await this.calibStationRepository.count();
  }

  async getStatistics(): Promise<{
    total: number;
    byCountry: Record<string, number>;
    byProvider: Record<string, number>;
    avgKGE_cal: number;
    avgKGE_val: number;
    avgNSE_cal: number;
    avgNSE_val: number;
  }> {
    const cacheKey = 'statistics';
    const cached = this.getCached<any>(cacheKey);
    if (cached) return cached;

    // Paralelno izvrsavanje svih upita umesto sekvencijalnog
    const [total, countryStats, providerStats, avgMetrics] = await Promise.all([
      this.count(),
      this.calibStationRepository
        .createQueryBuilder('calibStation')
        .select('calibStation.Country', 'country')
        .addSelect('COUNT(*)', 'count')
        .where('calibStation.Country IS NOT NULL')
        .groupBy('calibStation.Country')
        .getRawMany(),
      this.calibStationRepository
        .createQueryBuilder('calibStation')
        .select('calibStation.Provider', 'provider')
        .addSelect('COUNT(*)', 'count')
        .where('calibStation.Provider IS NOT NULL')
        .groupBy('calibStation.Provider')
        .getRawMany(),
      this.calibStationRepository
        .createQueryBuilder('calibStation')
        .select('AVG(calibStation.KGE_cal)', 'avgKGE_cal')
        .addSelect('AVG(calibStation.KGE_val)', 'avgKGE_val')
        .addSelect('AVG(calibStation.NSE_cal)', 'avgNSE_cal')
        .addSelect('AVG(calibStation.NSE_val)', 'avgNSE_val')
        .getRawOne(),
    ]);

    const result = {
      total,
      byCountry: countryStats.reduce((acc, item) => {
        acc[item.country] = parseInt(item.count);
        return acc;
      }, {}),
      byProvider: providerStats.reduce((acc, item) => {
        acc[item.provider] = parseInt(item.count);
        return acc;
      }, {}),
      avgKGE_cal: parseFloat(avgMetrics.avgkge_cal) || 0,
      avgKGE_val: parseFloat(avgMetrics.avgkge_val) || 0,
      avgNSE_cal: parseFloat(avgMetrics.avgnse_cal) || 0,
      avgNSE_val: parseFloat(avgMetrics.avgnse_val) || 0,
    };

    this.setCache(cacheKey, result);
    return result;
  }

  /**
   * Dobij graph podatke za stanicu putem Python skripte.
   * Koristi execFile umesto exec za bezbednost (bez shell interpolacije).
   */
  async getGraphData(stationName: string): Promise<any> {
    const scriptPath = path.join(__dirname, '..', '..', 'python', 'get_station_data.py');
    this.logger.log(`Graph data for station: ${stationName}`);

    try {
      const stdout = await this.pythonProcess.execScript(scriptPath, [
        '--station',
        stationName,
      ]);

      if (stdout.trim() === 'null' || !stdout.trim()) {
        return { error: 'No data found for station', station: stationName };
      }

      return JSON.parse(stdout);
    } catch (parseOrExecError) {
      this.logger.error(
        `Error getting station graph data for ${stationName}`,
        parseOrExecError,
      );
      return { error: 'Failed to get graph data', station: stationName };
    }
  }
}
