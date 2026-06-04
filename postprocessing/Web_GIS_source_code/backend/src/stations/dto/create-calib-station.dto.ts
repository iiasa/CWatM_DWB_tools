import { IsOptional, IsString, IsNumber, IsDateString, IsInt } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateCalibStationDto {
  @IsOptional()
  @IsDateString()
  Val_Start?: Date;

  @IsOptional()
  @IsDateString()
  Val_End?: Date;

  @IsOptional()
  @IsDateString()
  Cal_Start?: Date;

  @IsOptional()
  @IsDateString()
  Cal_End?: Date;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  no?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  lat?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  lon?: number;

  @IsOptional()
  @IsString()
  Subbasin?: string;

  @IsOptional()
  @IsString()
  Idall?: string;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  ID_numeric?: number;

  @IsOptional()
  @IsString()
  ID?: string;

  @IsOptional()
  @IsString()
  Provider?: string;

  @IsOptional()
  @IsString()
  River?: string;

  @IsOptional()
  @IsString()
  Station?: string;

  @IsOptional()
  @IsString()
  Country?: string;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  DrainArPro?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  DrainArLDD?: number;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  EnoughQdat?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  CatchmentA?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  SamplingFr?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  Inflow?: number;

  @IsOptional()
  @IsString()
  Inflow_ID?: string;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  KGE_cal?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  KGE_val?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  NSE_cal?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  NSE_val?: number;
}
