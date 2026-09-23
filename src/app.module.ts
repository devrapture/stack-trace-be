import { Module } from '@nestjs/common';
import { AppLoggerModule } from './common/logging/logging.module.js';
import { PlatformConfigModule } from './config/platform-config.module.js';

@Module({
  imports: [PlatformConfigModule, AppLoggerModule],
})
export class AppModule {}
