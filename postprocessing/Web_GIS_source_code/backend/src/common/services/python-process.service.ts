import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { execFile, spawn, ChildProcess } from 'child_process';

export interface PythonExecOptions {
  maxBuffer?: number;
  timeout?: number;
}

export interface PythonSpawnResult {
  process: ChildProcess;
  stdout: Promise<string>;
}

@Injectable()
export class PythonProcessService {
  private readonly logger = new Logger(PythonProcessService.name);
  private activeProcesses = 0;
  private readonly maxConcurrent: number;
  private readonly queue: Array<{ resolve: () => void }> = [];

  constructor(private readonly configService: ConfigService) {
    this.maxConcurrent = parseInt(
      this.configService.get<string>('MAX_PYTHON_PROCESSES', '6'),
      10,
    );
    this.logger.log(
      `Python process limiter initialized: max ${this.maxConcurrent} concurrent`,
    );
  }

  private async acquireSlot(): Promise<void> {
    if (this.activeProcesses < this.maxConcurrent) {
      this.activeProcesses++;
      return;
    }
    return new Promise<void>((resolve) => {
      this.queue.push({ resolve });
    });
  }

  private releaseSlot(): void {
    this.activeProcesses--;
    if (this.queue.length > 0) {
      const next = this.queue.shift();
      this.activeProcesses++;
      next.resolve();
    }
  }

  /**
   * Pokreni Python skriptu sa execFile (buffered output).
   * Koristi se za station i subbasin graph endpointe.
   */
  async execScript(
    scriptPath: string,
    args: string[],
    options: PythonExecOptions = {},
  ): Promise<string> {
    await this.acquireSlot();
    try {
      return await new Promise<string>((resolve, reject) => {
        execFile(
          'python',
          [scriptPath, ...args],
          {
            maxBuffer: options.maxBuffer ?? 50 * 1024 * 1024,
            timeout: options.timeout ?? 120_000,
          },
          (error, stdout, stderr) => {
            if (error && stderr) {
              this.logger.warn(`Python stderr: ${stderr.slice(0, 500)}`);
            }
            if (error) {
              reject(error);
            } else {
              resolve(stdout);
            }
          },
        );
      });
    } finally {
      this.releaseSlot();
    }
  }

  /**
   * Pokreni Python skriptu sa spawn (streaming output).
   * Koristi se za point-graph SSE endpoint.
   * Vraca ChildProcess za streaming kontrolu - pozivalac mora pozvati releaseSlot().
   */
  async spawnScript(
    scriptPath: string,
    args: string[],
  ): Promise<{ process: ChildProcess; releaseSlot: () => void }> {
    await this.acquireSlot();
    const pythonProcess = spawn('python', [scriptPath, ...args]);
    return {
      process: pythonProcess,
      releaseSlot: () => this.releaseSlot(),
    };
  }

  getStats(): { active: number; queued: number; maxConcurrent: number } {
    return {
      active: this.activeProcesses,
      queued: this.queue.length,
      maxConcurrent: this.maxConcurrent,
    };
  }
}
