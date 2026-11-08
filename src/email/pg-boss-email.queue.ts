import {
  HttpStatus,
  Inject,
  Injectable,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { AppError } from '../common/error/app-error.js';
import { ErrorCode } from '../common/error/error-codes.js';
import { PgBossService } from '../queue/pg-boss.service.js';
import { EMAIL_TRANSPORT, type EmailTransport } from './email-provider.js';
import {
  EmailQueue,
  EnqueueEmailInput,
  EnqueueEmailResult,
} from './email-queue.js';

const QUEUE_NAME = 'email.send';

@Injectable()
export class PgBossEmailQueue implements EmailQueue, OnApplicationBootstrap {
  constructor(
    private readonly pgBossService: PgBossService,
    @Inject(EMAIL_TRANSPORT)
    private readonly transport: EmailTransport,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(PgBossEmailQueue.name);
  }

  async onApplicationBootstrap(): Promise<void> {
    await this.pgBossService.client.createQueue(QUEUE_NAME, {
      retryLimit: 5,
      retryDelay: 10,
      retryBackoff: true,
      retryDelayMax: 60,
      expireInSeconds: 60,
      retentionSeconds: 6 * 60 * 60,
      deleteAfterSeconds: 60 * 60,
    });

    await this.pgBossService.client.work<EnqueueEmailInput>(
      QUEUE_NAME,
      {
        batchSize: 1,
        localConcurrency: 1,
        pollingIntervalSeconds: 1,
      },
      async (jobs) => {
        for (const job of jobs) {
          const input = job.data;
          if (input.expiresAt && Date.parse(input.expiresAt) <= Date.now()) {
            this.logger.info(
              {
                jobId: job.id,
                kind: input.kind,
              },
              'Expired email skipped',
            );
            continue;
          }

          try {
            await this.transport.send(
              {
                ...input.message,
                idempotencyKey: input.idempotencyKey,
              },
              job.signal,
            );
          } catch {
            this.logger.warn(
              {
                jobId: job.id,
                attempt: job.retryCount + 1,
              },
              'Email delivery fail',
            );
            throw new Error('Email delivery failed');
          }
        }
      },
    );
  }

  async enqueue(input: EnqueueEmailInput): Promise<EnqueueEmailResult> {
    const jobId = await this.pgBossService.client.send(QUEUE_NAME, input, {
      priority: input.critical ? 10 : 0,
    });

    if (!jobId)
      throw new AppError(
        ErrorCode.INTERNAL,
        'Failed to queue email',
        HttpStatus.SERVICE_UNAVAILABLE,
      );

    return {
      jobId,
    };
  }
}
