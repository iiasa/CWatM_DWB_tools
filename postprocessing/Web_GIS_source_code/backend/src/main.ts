/* eslint-disable @typescript-eslint/no-var-requires */
import * as os from 'os';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

const cluster = require('cluster');

const numWorkers = Math.min(
  parseInt(process.env.CLUSTER_WORKERS || '0', 10) || os.cpus().length,
  os.cpus().length,
);

if (numWorkers > 1 && cluster.isPrimary) {
  const logger = new Logger('Cluster');
  logger.log(`Primary process ${process.pid} starting ${numWorkers} workers`);

  for (let i = 0; i < numWorkers; i++) {
    cluster.fork();
  }

  cluster.on('exit', (worker) => {
    logger.warn(`Worker ${worker.process.pid} died, restarting...`);
    cluster.fork();
  });
} else {
  bootstrap();
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  const port = configService.get<number>('app.port');
  const corsOrigins = configService.get<string[]>('app.cors.origins');

  // Kompresija odgovora - preskace SSE (text/event-stream)
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const compressionMiddleware = require('compression');
  app.use(
    compressionMiddleware({
      threshold: 1024,
      filter: (req, res) => {
        if (res.getHeader('Content-Type') === 'text/event-stream') {
          return false;
        }
        return compressionMiddleware.filter(req, res);
      },
    }),
  );

  app.enableCors({
    origin: corsOrigins,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
    credentials: true,
    optionsSuccessStatus: 200,
    // Cache CORS preflight for 24h so the browser stops re-asking on every
    // subsequent fetch. Without this, each non-simple request adds ~300 ms.
    maxAge: 86400,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.useGlobalFilters(new HttpExceptionFilter());

  const server = await app.listen(port);
  server.setTimeout(120_000);

  const logger = new Logger('Bootstrap');
  logger.log(
    `Worker ${process.pid} listening on port ${port}` +
      (numWorkers > 1 ? ` (${numWorkers} workers)` : ''),
  );
}
