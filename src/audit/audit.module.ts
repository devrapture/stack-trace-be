import { Module } from '@nestjs/common';
import { AUDIT_LOG_REPOSITORY } from './audit-log.repository.js';
import { PrismaAuditLogRepository } from './prisma-audit-log.repository.js';

@Module({
  providers: [
    {
      provide: AUDIT_LOG_REPOSITORY,
      useClass: PrismaAuditLogRepository,
    },
  ],
  exports: [AUDIT_LOG_REPOSITORY],
})
export class AuditModule {}
