import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';

export const PG_POOL = 'PG_POOL';

@Module({
  providers: [
    {
      provide: PG_POOL,
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => {
        const extra = cfg.get('database.extra');
        return new Pool({
          host: cfg.get('database.host'),
          port: cfg.get('database.port'),
          database: cfg.get('database.database'),
          user: cfg.get('database.username'),
          password: cfg.get('database.password'),
          ssl: false,
          max: extra?.max ?? 5,
          idleTimeoutMillis: extra?.idle ?? 10000,
        });
      },
    },
  ],
  exports: [PG_POOL],
})
export class DatabaseModule {}
