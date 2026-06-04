import { Controller, Get, Query, ParseFloatPipe, Req, Res, Logger } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { PointGraphService } from './point-graph.service';
import { RedisService } from '../common/services/redis.service';
import { ConfigService } from '@nestjs/config';

// Named-throttler skip (see tiles.controller.ts for the gotcha explanation).
@SkipThrottle({ short: true, long: true })
@Controller('point-graph')
export class PointGraphController {
  private readonly logger = new Logger(PointGraphController.name);
  private readonly cacheTtl: number;

  constructor(
    private readonly pointGraphService: PointGraphService,
    private readonly redisService: RedisService,
    private readonly configService: ConfigService,
  ) {
    this.cacheTtl = parseInt(
      this.configService.get<string>('CACHE_TTL_SECONDS', '2592000'),
      10,
    );
  }

  @Get('coverage')
  async getCoverage(): Promise<Record<string, number>> {
    const cacheKey = 'point-graph:coverage:v1';
    try {
      const cached = await this.redisService.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch (err) {
      this.logger.warn(`Coverage cache lookup failed: ${err.message}`);
    }

    const bbox = await this.pointGraphService.fetchCoverageBbox();
    this.redisService
      .set(cacheKey, JSON.stringify(bbox), 3600)
      .catch((err) =>
        this.logger.warn(`Failed to cache coverage bbox: ${err.message}`),
      );
    return bbox;
  }

  @Get('data')
  async getPointData(
    @Query('lat', ParseFloatPipe) lat: number,
    @Query('lon', ParseFloatPipe) lon: number,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<any> {
    // SSE headers
    response.setHeader('Content-Type', 'text/event-stream');
    response.setHeader('Cache-Control', 'no-cache');
    response.setHeader('Connection', 'keep-alive');
    response.setHeader('X-Accel-Buffering', 'no');
    response.flushHeaders();

    const sendSSE = (event: string, data: any) => {
      response.write(`event: ${event}\n`);
      response.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    // Round to 4 decimals (~11m precision, finer than ~5km grid)
    // Use rounded values for both cache key and FastAPI request for consistency
    const roundedLat = parseFloat(lat.toFixed(4));
    const roundedLon = parseFloat(lon.toFixed(4));
    const cacheKey = `point-graph:v1:${roundedLat}:${roundedLon}`;

    // Check Redis cache first
    try {
      const cached = await this.redisService.get(cacheKey);
      if (cached) {
        this.logger.log(`Cache HIT for (${lat}, ${lon})`);
        const data = JSON.parse(cached);
        sendSSE('complete', data);
        response.end();
        return;
      }
    } catch (err) {
      this.logger.warn(`Cache lookup failed: ${err.message}`);
    }

    this.logger.log(`Cache MISS for (${roundedLat}, ${roundedLon}) — proxying to FastAPI`);

    // Proxy SSE stream from FastAPI sidecar
    let abortUpstream: (() => void) | null = null;
    let finished = false;

    const cleanup = () => {
      if (!finished) {
        finished = true;
        if (abortUpstream) {
          abortUpstream();
          abortUpstream = null;
        }
      }
    };

    // Handle client disconnect
    request.on('close', () => {
      if (!finished) {
        this.logger.log(`Client disconnected for (${lat}, ${lon})`);
        cleanup();
      }
    });

    try {
      const handle = await this.pointGraphService.fetchPointData(roundedLat, roundedLon);
      abortUpstream = handle.abort;

      if (finished) {
        // Client already disconnected while we were connecting
        handle.abort();
        return;
      }

      const upstream = handle.response;
      let buffer = '';

      upstream.on('data', (chunk: Buffer) => {
        if (finished) return;

        buffer += chunk.toString();
        const parts = buffer.split('\n\n');
        // Last part may be incomplete — keep it in the buffer
        buffer = parts.pop() || '';

        for (const part of parts) {
          if (!part.trim()) continue;

          // Forward the raw SSE event to the client
          response.write(part + '\n\n');

          // Intercept 'complete' event to cache the result
          const lines = part.split('\n');
          const eventLine = lines.find((l) => l.startsWith('event: '));
          const dataLine = lines.find((l) => l.startsWith('data: '));

          if (eventLine && dataLine) {
            const eventName = eventLine.substring('event: '.length).trim();
            if (eventName === 'complete') {
              const dataStr = dataLine.substring('data: '.length);
              this.redisService
                .set(cacheKey, dataStr, this.cacheTtl)
                .catch((err) =>
                  this.logger.warn(`Failed to cache result: ${err.message}`),
                );
            }
          }
        }
      });

      upstream.on('end', () => {
        if (!finished) {
          // Flush any remaining buffer
          if (buffer.trim()) {
            response.write(buffer + '\n\n');
          }
          response.end();
          finished = true;
        }
      });

      upstream.on('error', (err) => {
        this.logger.error(`Upstream SSE error for (${lat}, ${lon}): ${err.message}`);
        if (!finished) {
          sendSSE('error', {
            error: 'FastAPI stream error',
            message: err.message,
          });
          response.end();
          cleanup();
        }
      });
    } catch (err) {
      this.logger.error(`Failed to connect to FastAPI for (${lat}, ${lon}): ${err.message}`);
      if (!finished) {
        sendSSE('error', {
          error: 'Failed to get point data',
          message: err.message,
        });
        response.end();
        finished = true;
      }
    }
  }
}
