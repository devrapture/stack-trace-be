import { Global, Module } from '@nestjs/common';
import { PlatformConfigModule } from '../config/platform-config.module.js';
import { PrismaService } from './prisma.service.js';

@Global()
@Module({
  imports: [PlatformConfigModule],
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
