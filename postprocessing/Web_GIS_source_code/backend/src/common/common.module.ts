import { Global, Module } from '@nestjs/common';
import { PythonProcessService } from './services/python-process.service';
import { RedisService } from './services/redis.service';

@Global()
@Module({
  providers: [PythonProcessService, RedisService],
  exports: [PythonProcessService, RedisService],
})
export class CommonModule {}
