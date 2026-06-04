import { Module } from '@nestjs/common';
import { PointGraphController } from './point-graph.controller';
import { PointGraphService } from './point-graph.service';

@Module({
  controllers: [PointGraphController],
  providers: [PointGraphService],
})
export class PointGraphModule {}
