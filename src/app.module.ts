import { Module } from '@nestjs/common';
import { AppLoggerModule } from './common/logging/logging.module.js';
import { PlatformConfigModule } from './config/platform-config.module.js';
import { HealthModule } from './health/health.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { UsersModule } from './users/users.module.js';

@Module({
  imports: [
    PlatformConfigModule,
    AppLoggerModule,
    PrismaModule,
    HealthModule,
    UsersModule,
  ],
})
export class AppModule {}
