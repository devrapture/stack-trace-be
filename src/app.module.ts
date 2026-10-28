import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { AdminModule } from './admin/admin.module.js';
import { AuthModule } from './auth/auth.module.js';
import { AppLoggerModule } from './common/logging/logging.module.js';
import { PlatformConfigModule } from './config/platform-config.module.js';
import { HealthModule } from './health/health.module.js';
import { OauthModule } from './oauth/oauth.module.js';
import { PrismaModule } from './prisma/prisma.module.js';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    PlatformConfigModule,
    AppLoggerModule,
    PrismaModule,
    HealthModule,
    AuthModule,
    OauthModule,
    AdminModule,
  ],
})
export class AppModule {}
