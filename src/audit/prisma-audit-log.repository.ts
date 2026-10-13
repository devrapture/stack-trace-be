import { Injectable } from '@nestjs/common';
import { TransactionClient } from '../prisma/db.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  AuditLogCursor,
  AuditLogEntry,
  AuditLogRepository,
  RecordAuditEventInput,
} from './audit-log.repository.js';

@Injectable()
export class PrismaAuditLogRepository implements AuditLogRepository {
  private readonly db: PrismaService['db']['orm']['public'];
  constructor(private readonly prisma: PrismaService) {
    this.db = this.prisma.db.orm.public;
  }

  async record(
    input: RecordAuditEventInput,
    tx?: TransactionClient,
  ): Promise<void> {
    const client = tx ?? this.prisma.db;
    await client.orm.public.AuditLog.create({
      userId: input.userId,
      actorUserId: input.actorUserId,
      eventType: input.eventType,
      ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
    });
  }

  async list(options: {
    limit: number;
    cursor?: AuditLogCursor;
  }): Promise<AuditLogEntry[]> {
    const { limit, cursor } = options;
    const ordered = this.db.AuditLog.orderBy([
      (log) => log.createdAt.desc(),
      (log) => log.id.desc(),
    ]);

    const rows = cursor
      ? ordered
          .cursor({
            createdAt: cursor?.createdAt,
            id: cursor?.id,
          })
          .limit(limit)
          .all()
      : await ordered.limit(limit).all();

    return rows;
  }
}
