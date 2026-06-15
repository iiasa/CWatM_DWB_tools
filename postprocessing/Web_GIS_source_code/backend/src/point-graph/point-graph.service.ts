import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as http from 'http';

@Injectable()
export class PointGraphService {
  private readonly logger = new Logger(PointGraphService.name);
  private readonly apiBaseUrl: string;

  constructor(private readonly configService: ConfigService) {
    this.apiBaseUrl = this.configService.get<string>(
      'POINT_GRAPH_API_URL',
      'http://point-graph-api:8086',
    );
    this.logger.log(`Point Graph API URL: ${this.apiBaseUrl}`);
  }

  /**
   * Fetch the coverage bbox from the FastAPI sidecar.
   * Returns { lat_min, lat_max, lon_min, lon_max }.
   */
  fetchCoverageBbox(): Promise<Record<string, number>> {
    const url = `${this.apiBaseUrl}/coverage`;
    return new Promise((resolve, reject) => {
      const req = http.get(url, (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          if (res.statusCode !== 200) {
            reject(
              new Error(
                `FastAPI /coverage returned ${res.statusCode}: ${body.slice(0, 500)}`,
              ),
            );
            return;
          }
          try {
            resolve(JSON.parse(body));
          } catch (err) {
            reject(new Error(`Failed to parse coverage bbox: ${err.message}`));
          }
        });
      });
      req.on('error', (err) =>
        reject(new Error(`FastAPI /coverage connection failed: ${err.message}`)),
      );
      req.setTimeout(5_000, () => {
        req.destroy();
        reject(new Error('FastAPI /coverage timed out after 5s'));
      });
    });
  }

  /**
   * Fetch point data from the FastAPI sidecar as an SSE stream.
   * Returns the raw IncomingMessage for the controller to proxy.
   */
  fetchPointData(
    lat: number,
    lon: number,
  ): Promise<{ response: http.IncomingMessage; abort: () => void }> {
    const url = `${this.apiBaseUrl}/point-data?lat=${lat}&lon=${lon}`;
    this.logger.log(`Fetching point data for (${lat}, ${lon}) from ${url}`);

    return new Promise((resolve, reject) => {
      const req = http.get(url, (res) => {
        if (res.statusCode !== 200) {
          let body = '';
          res.on('data', (chunk) => (body += chunk));
          res.on('end', () => {
            reject(
              new Error(
                `FastAPI returned ${res.statusCode}: ${body.slice(0, 500)}`,
              ),
            );
          });
          return;
        }
        resolve({
          response: res,
          abort: () => req.destroy(),
        });
      });

      req.on('error', (err) => {
        reject(new Error(`FastAPI connection failed: ${err.message}`));
      });

      // 5 minute timeout for long-running queries
      req.setTimeout(300_000, () => {
        req.destroy();
        reject(new Error('FastAPI request timed out after 300s'));
      });
    });
  }
}
