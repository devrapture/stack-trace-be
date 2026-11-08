import { Module } from '@nestjs/common';
import { PlatformConfigModule } from '../config/platform-config.module.js';
import { PgBossService } from './pg-boss.service.js';

@Module({
  imports: [PlatformConfigModule],
  providers: [PgBossService],
  exports: [PgBossService],
})
export class QueueModule {}
