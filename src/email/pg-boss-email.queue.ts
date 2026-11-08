import {
  HttpStatus,
  Inject,
  Injectable,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { AppError } from '../common/error/app-error.js';
import { ErrorCode } from '../common/error/error-codes.js';
import type { FieldOutputTypes } from '../prisma/contract.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { PgBossService } from '../queue/pg-boss.service.js';
import { EMAIL_TRANSPORT, type EmailTransport } from './email-provider.js';
import {
  EmailQueue,
  EnqueueEmailInput,
  EnqueueEmailResult,
} from './email-queue.js';

const QUEUE_NAME = 'email.send';

type OtpEmailInput = Extract<EnqueueEmailInput, { expiresAt: string }>;
type ChallengeStatus = Pick<
  FieldOutputTypes['public']['EmailVerificationChallenge'],
  'id' | 'consumedAt' | 'expiresAt' | 'attemptCount' | 'maxAttempts'
>;

@Injectable()
export class PgBossEmailQueue implements EmailQueue, OnApplicationBootstrap {
  constructor(
    private readonly pgBossService: PgBossService,
    @Inject(EMAIL_TRANSPORT)
    private readonly transport: EmailTransport,
    private readonly logger: PinoLogger,
    private readonly prisma: PrismaService,
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

          if (
            (input.kind === 'registration_otp' ||
              input.kind === 'password_reset_otp' ||
              input.kind === 'oauth_link_challenge_otp') &&
            !(await this.isChallengeActive(input))
          ) {
            this.logger.info(
              {
                jobId: job.id,
                kind: input.kind,
              },
              'Inactive challenge email skipped',
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

  private async isChallengeActive(input: OtpEmailInput): Promise<boolean> {
    // Jobs queued before challenge IDs were added cannot be checked safely.
    if (!input.challengeId || !input.userId) return false;

    const db = this.prisma.db.orm.public;
    let challenge: ChallengeStatus | null;
    switch (input.kind) {
      case 'registration_otp':
        challenge = await db.EmailVerificationChallenge.where({
          userId: input.userId,
          purpose: 'REGISTRATION',
        })
          .orderBy((challenge) => challenge.createdAt.desc())
          .select(
            'id',
            'consumedAt',
            'expiresAt',
            'attemptCount',
            'maxAttempts',
          )
          .first();
        break;
      case 'password_reset_otp':
        challenge = await db.PasswordResetChallenge.where({
          userId: input.userId,
        })
          .orderBy((challenge) => challenge.createdAt.desc())
          .select(
            'id',
            'consumedAt',
            'expiresAt',
            'attemptCount',
            'maxAttempts',
          )
          .first();
        break;
      case 'oauth_link_challenge_otp':
        challenge = await db.OAuthLinkChallenge.where({
          userId: input.userId,
        })
          .orderBy((challenge) => challenge.createdAt.desc())
          .select(
            'id',
            'consumedAt',
            'expiresAt',
            'attemptCount',
            'maxAttempts',
          )
          .first();
        break;
    }

    return (
      challenge !== null &&
      challenge.id === input.challengeId &&
      challenge.consumedAt === null &&
      challenge.expiresAt.epochMilliseconds > Date.now() &&
      challenge.attemptCount < challenge.maxAttempts
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
