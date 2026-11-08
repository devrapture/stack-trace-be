import { Module } from '@nestjs/common';
import { PlatformConfigModule } from '../config/platform-config.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { QueueModule } from '../queue/queue.module.js';
import { EMAIL_TRANSPORT } from './email-provider.js';
import { EMAIL_QUEUE } from './email-queue.js';
import { PgBossEmailQueue } from './pg-boss-email.queue.js';
import { ResendEmailTransport } from './resend-email.provider.js';

@Module({
  imports: [PlatformConfigModule, PrismaModule, QueueModule],
  providers: [
    {
      provide: EMAIL_TRANSPORT,
      useClass: ResendEmailTransport,
    },
    {
      provide: EMAIL_QUEUE,
      useClass: PgBossEmailQueue,
    },
  ],
  exports: [EMAIL_TRANSPORT, EMAIL_QUEUE],
})
export class EmailModule {}
