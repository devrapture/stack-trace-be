import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module.js';
import { AppLoggerModule } from './common/logging/logging.module.js';
import { PlatformConfigModule } from './config/platform-config.module.js';
import { HealthModule } from './health/health.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { OauthModule } from './oauth/oauth.module.js';

@Module({
  imports: [
    PlatformConfigModule,
    AppLoggerModule,
    PrismaModule,
    HealthModule,
    AuthModule,
    OauthModule,
  ],
})
export class AppModule {}
