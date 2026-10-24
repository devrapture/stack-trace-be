import {
  BadRequestException,
  Controller,
  Get,
  Inject,
  Query,
  UseGuards,
} from '@nestjs/common';
import { isUUID } from 'class-validator';
import { Temporal } from 'temporal-polyfill/full';
import {
  AUDIT_LOG_REPOSITORY,
  AuditLogCursor,
  AuditLogEntry,
  type AuditLogRepository,
} from '../audit/audit-log.repository.js';
import { ListAuditLogsDto } from './dto/list-audit-logs.dto.js';
import { PermissionsGuard } from './permissions.guard.js';
import { RequirePermission } from './require-permission.decorator.js';

const DEFAULT_PAGE_SIZE = 50;

function parseCursor(cursor: string): AuditLogCursor {
  try {
    const value: unknown = JSON.parse(cursor);

    if (
      typeof value !== 'object' ||
      value === null ||
      !('createdAt' in value) ||
      typeof value.createdAt !== 'string' ||
      !('id' in value) ||
      typeof value.id !== 'string' ||
      !isUUID(value.id)
    ) {
      throw new Error('Invalid cursor shape');
    }

    return {
      createdAt: Temporal.Instant.from(value.createdAt),
      id: value.id,
    };
  } catch {
    throw new BadRequestException('Invalid audit log cursor.');
  }
}

@Controller('admin')
@UseGuards(PermissionsGuard)
export class AdminController {
  constructor(
    @Inject(AUDIT_LOG_REPOSITORY)
    private readonly auditLogRepository: AuditLogRepository,
  ) {}

  @Get('audit-logs')
  @RequirePermission('admin:access')
  async listAuditLogs(
    @Query() query: ListAuditLogsDto,
  ): Promise<AuditLogEntry[]> {
    const entries = await this.auditLogRepository.list({
      limit: query.limit ?? DEFAULT_PAGE_SIZE,
      ...(query.cursor
        ? {
            cursor: parseCursor(query.cursor),
          }
        : {}),
    });

    return entries;
  }
}
