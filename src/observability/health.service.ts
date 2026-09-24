import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  type HealthChecks,
  type HealthResponse,
  HealthResponseDto,
} from './dto/health-response.dto.js';

@Injectable()
export class HealthService {
  private static readonly DB_CHECK_TIMEOUT_MS = 2_000;

  private databaseWasUp: boolean | undefined;

  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(HealthService.name);
  }

  getLiveness(): HealthResponse {
    return this.buildResponse('ok', {
      process: 'up',
    });
  }

  async getReadiness(): Promise<HealthResponse> {
    const databaseUp = await this.checkDatabase();

    return this.buildResponse(databaseUp ? 'ok' : 'unavailable', {
      process: 'up',
      database: databaseUp ? 'up' : 'down',
    });
  }

  private async checkDatabase(): Promise<boolean> {
    try {
      await this.withTimeout(
        (signal) => this.prisma.ping(signal),
        HealthService.DB_CHECK_TIMEOUT_MS,
      );

      if (this.databaseWasUp === false) {
        this.logger.info('Database readiness recovered');
      }

      this.databaseWasUp = true;

      return true;
    } catch (error) {
      // Log the initial failure or a transition from up to down.
      // Repeated failed health probes will not flood the logs.
      if (this.databaseWasUp !== false) {
        this.logger.warn({ err: error }, 'Database readiness check failed');
      }

      this.databaseWasUp = false;

      return false;
    }
  }

  private async withTimeout<T>(
    operation: (signal: AbortSignal) => Promise<T>,
    timeoutMs: number,
  ): Promise<T> {
    const abortController = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;

    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        const error = new Error(
          `Database check timed out after ${timeoutMs}ms`,
        );

        abortController.abort(error);
        reject(error);
      }, timeoutMs);
    });

    try {
      return await Promise.race([operation(abortController.signal), timeout]);
    } finally {
      if (timer) {
        clearTimeout(timer);
      }
    }
  }

  private buildResponse(
    status: 'ok' | 'unavailable',
    checks: HealthChecks,
  ): HealthResponse {
    return new HealthResponseDto(
      status,
      'stack-trace-api',
      new Date().toISOString(),
      Math.floor(process.uptime()),
      checks,
    );
  }
}
