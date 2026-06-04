import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CalibStationsService } from './calib-stations.service';
import { CalibStationsController } from './calib-stations.controller';
import { CalibStation } from './entities/calib-station.entity';

@Module({
  imports: [TypeOrmModule.forFeature([CalibStation])],
  controllers: [CalibStationsController],
  providers: [CalibStationsService],
  exports: [CalibStationsService],
})
export class CalibStationsModule {}
