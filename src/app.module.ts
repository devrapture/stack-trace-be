import { Module } from '@nestjs/common';
import { AppLoggerModule } from './common/logging/logging.module.js';
import { PlatformConfigModule } from './config/platform-config.module.js';
import { PrismaModule } from './prisma/prisma.module.js';

@Module({
  imports: [PlatformConfigModule, AppLoggerModule, PrismaModule],
})
export class AppModule {}
