import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module.js';
import { UsersModule } from '../users/users.module.js';
import { AdminController } from './admin.controller.js';
import { PermissionsGuard } from './permissions.guard.js';

@Module({
  imports: [UsersModule, AuditModule],
  providers: [PermissionsGuard],
  controllers: [AdminController],
  exports: [PermissionsGuard],
})
export class AdminModule {}
