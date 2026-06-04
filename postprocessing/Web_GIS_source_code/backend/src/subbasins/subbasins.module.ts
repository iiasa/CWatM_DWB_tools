import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { SubbasinsService } from './subbasins.service';
import { SubbasinsController } from './subbasins.controller';

@Module({
  imports: [DatabaseModule],
  controllers: [SubbasinsController],
  providers: [SubbasinsService],
})
export class SubbasinsModule {}

