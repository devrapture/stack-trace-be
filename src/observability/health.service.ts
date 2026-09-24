import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  HealthChecks,
  HealthResponse,
  HealthResponseDto,
} from './dto/health-response.dto.js';

@Injectable()
export class HealthService {
  constructor(private readonly prisma: PrismaService) {}

  getLiveness(): HealthResponse {
    return this.buildResponse('ok', {
      process: 'up',
    });
  }

  async getReadiness(): Promise<HealthResponse> {
    try {
      await this.prisma.ping();
      return this.buildResponse('ok', {
        process: 'up',
        database: 'up',
      });
    } catch {
      return this.buildResponse('unavailable', {
        process: 'up',
        database: 'down',
      });
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
