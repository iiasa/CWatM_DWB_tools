import { CalibStation } from '../entities/calib-station.entity';

export interface CalibStationResponse {
  success: boolean;
  data: CalibStation | CalibStation[];
  message?: string;
  total?: number;
}

export interface CalibStationStatistics {
  total: number;
  byCountry: Record<string, number>;
  byProvider: Record<string, number>;
  avgKGE_cal: number;
  avgKGE_val: number;
  avgNSE_cal: number;
  avgNSE_val: number;
}
