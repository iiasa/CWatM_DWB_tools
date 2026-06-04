import { IsOptional, IsNumber, IsInt } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateSubbasinDto {
  @IsOptional()
  geom?: any;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  HYBAS_ID?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  NEXT_DOWN?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  NEXT_SINK?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  MAIN_BAS?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  DIST_SINK?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  DIST_MAIN?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  SUB_AREA?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  UP_AREA?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  PFAF_ID?: number;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  ENDO?: number;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  COAST?: number;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  ORDER?: number;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  SORT?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  HYBAS_ID_2?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  NEXT_DOWN_?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  NEXT_SINK_?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  MAIN_BAS_2?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  DIST_SINK_?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  DIST_MAIN_?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  SUB_AREA_2?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  UP_AREA_2?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  PFAF_ID_2?: number;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  ENDO_2?: number;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  COAST_2?: number;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  ORDER_2?: number;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  SORT_2?: number;
}

