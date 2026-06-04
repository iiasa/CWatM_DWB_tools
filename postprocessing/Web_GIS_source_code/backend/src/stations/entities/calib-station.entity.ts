import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';

@Entity('calib_stations')
@Index('idx_calib_stations_subbasin', ['Subbasin'])
@Index('idx_calib_stations_country', ['Country'])
@Index('idx_calib_stations_provider', ['Provider'])
@Index('idx_calib_stations_inflow_id', ['Inflow_ID'])
export class CalibStation {
  @PrimaryGeneratedColumn()
  id: number;

  @Index('idx_calib_stations_geom_gist', { spatial: true })
  @Column({ type: 'geometry', nullable: true })
  geom: any; // PostGIS geometry type

  @Column({ type: 'timestamp', nullable: true })
  Val_Start: Date;

  @Column({ type: 'timestamp', nullable: true })
  Val_End: Date;

  @Column({ type: 'timestamp', nullable: true })
  Cal_Start: Date;

  @Column({ type: 'timestamp', nullable: true })
  Cal_End: Date;

  @Column({ type: 'integer', nullable: true })
  no: number;

  @Column({ type: 'decimal', precision: 10, scale: 8, nullable: true })
  lat: number;

  @Column({ type: 'decimal', precision: 11, scale: 8, nullable: true })
  lon: number;

  @Column({ type: 'varchar', length: 255, nullable: true })
  Subbasin: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  Idall: string;

  @Column({ type: 'integer', nullable: true })
  ID_numeric: number;

  @Column({ type: 'varchar', length: 255, nullable: true })
  ID: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  Provider: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  River: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  Station: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  Country: string;

  @Column({ type: 'decimal', precision: 15, scale: 2, nullable: true })
  DrainArPro: number;

  @Column({ type: 'decimal', precision: 15, scale: 2, nullable: true })
  DrainArLDD: number;

  @Column({ type: 'integer', nullable: true })
  EnoughQdat: number;

  @Column({ type: 'decimal', precision: 15, scale: 2, nullable: true })
  CatchmentA: number;

  @Column({ type: 'decimal', precision: 10, scale: 4, nullable: true })
  SamplingFr: number;

  @Column({ type: 'decimal', precision: 15, scale: 2, nullable: true })
  Inflow: number;

  @Column({ type: 'varchar', length: 255, nullable: true })
  Inflow_ID: string;

  @Column({ type: 'decimal', precision: 5, scale: 4, nullable: true })
  KGE_cal: number;

  @Column({ type: 'decimal', precision: 5, scale: 4, nullable: true })
  KGE_val: number;

  @Column({ type: 'decimal', precision: 5, scale: 4, nullable: true })
  NSE_cal: number;

  @Column({ type: 'decimal', precision: 5, scale: 4, nullable: true })
  NSE_val: number;
}
