import { Module } from '@nestjs/common';
import { TilesController } from './tiles.controller';
import { TilesService } from './tiles.service';
import { CommonModule } from '../common/common.module';
import { DatabaseModule } from '../database/database.module';

@Module({
  imports: [CommonModule, DatabaseModule],
  controllers: [TilesController],
  providers: [TilesService],
})
export class TilesModule {}
