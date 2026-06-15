import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';

@Entity('subbasins')
@Index('idx_subbasins_subbasin_id2', ['Subbasin', 'ID_2'])
@Index('idx_subbasins_inflow_id', ['Inflow_ID'])
@Index('idx_subbasins_country', ['Country'])
export class Subbasin {
  @PrimaryGeneratedColumn()
  id: number;

  @Index('idx_subbasins_geom_gist', { spatial: true })
  @Column({ type: 'geometry', spatialFeatureType: 'MultiPolygon', srid: 4326, nullable: true })
  geom: any; // PostGIS geometry type (MULTIPOLYGON)

  // Pre-simplified copy of `geom` used at low map zoom (z < 8) to make
  // ST_AsMVTGeom cheap. Maintained by a database trigger; do not write to it.
  @Index('idx_subbasins_geom_simplified_gist', { spatial: true })
  @Column({ type: 'geometry', spatialFeatureType: 'MultiPolygon', srid: 4326, nullable: true })
  geom_simplified: any;

  @Column({ type: 'numeric', nullable: true })
  gridcode: number;

  @Column({ type: 'numeric', nullable: true })
  no: number;

  @Column({ type: 'varchar', nullable: true })
  Subbasin: string;

  @Column({ type: 'varchar', nullable: true })
  Idall: string;

  @Column({ type: 'numeric', nullable: true })
  ID_numeric: number;

  @Column({ type: 'varchar', nullable: true })
  ID_2: string;

  @Column({ type: 'varchar', nullable: true })
  Provider: string;

  @Column({ type: 'varchar', nullable: true })
  River: string;

  @Column({ type: 'varchar', nullable: true })
  Station: string;

  @Column({ type: 'varchar', nullable: true })
  Country: string;

  @Column({ type: 'numeric', nullable: true })
  lat: number;

  @Column({ type: 'numeric', nullable: true })
  lon: number;

  @Column({ type: 'numeric', nullable: true })
  DrainArPro: number;

  @Column({ type: 'numeric', nullable: true })
  DrainArLDD: number;

  @Column({ type: 'numeric', nullable: true })
  EnoughQdat: number;

  @Column({ type: 'timestamp', nullable: true })
  Val_Start: Date;

  @Column({ type: 'timestamp', nullable: true })
  Val_End: Date;

  @Column({ type: 'timestamp', nullable: true })
  Cal_Start: Date;

  @Column({ type: 'timestamp', nullable: true })
  Cal_End: Date;

  @Column({ type: 'numeric', nullable: true })
  CatchmentA: number;

  @Column({ type: 'double precision', nullable: true })
  area: number;

  @Column({ type: 'numeric', nullable: true })
  SamplingFr: number;

  @Column({ type: 'numeric', nullable: true })
  Inflow: number;

  @Column({ type: 'varchar', nullable: true })
  Inflow_ID: string;

  @Column({ type: 'numeric', nullable: true })
  KGE_cal: number;

  @Column({ type: 'numeric', nullable: true })
  KGE_val: number;

  @Column({ type: 'numeric', nullable: true })
  NSE_cal: number;

  @Column({ type: 'numeric', nullable: true })
  NSE_val: number;

  @Column({ type: 'varchar', nullable: true })
  merged_ids: string;

  @Column({ type: 'numeric', nullable: true })
  ID: number;
}
