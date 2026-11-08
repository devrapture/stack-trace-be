import { Test } from '@nestjs/testing';
import { PinoLogger } from 'nestjs-pino';
import type { Job, WorkHandler, WorkOptions } from 'pg-boss';
import { Temporal } from 'temporal-polyfill/full';
import { onTestFinished, vi } from 'vitest';
import type { FieldOutputTypes } from '../prisma/contract.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { PgBossService } from '../queue/pg-boss.service.js';
import { EMAIL_TRANSPORT, type EmailTransport } from './email-provider.js';
import type { EnqueueEmailInput } from './email-queue.js';
import { PgBossEmailQueue } from './pg-boss-email.queue.js';

type OtpEmailInput = Extract<EnqueueEmailInput, { expiresAt: string }>;
type ChallengeStatus = Pick<
  FieldOutputTypes['public']['EmailVerificationChallenge'],
  'id' | 'consumedAt' | 'expiresAt' | 'attemptCount' | 'maxAttempts'
>;

function activeChallenge(id = 'challenge-id'): ChallengeStatus {
  return {
    id,
    consumedAt: null,
    expiresAt: Temporal.Now.instant().add({ minutes: 5 }),
    attemptCount: 0,
    maxAttempts: 5,
  };
}

function emailInput(
  kind: OtpEmailInput['kind'],
  challengeId = 'challenge-id',
): OtpEmailInput {
  return {
    kind,
    challengeId,
    userId: 'user-id',
    idempotencyKey: challengeId,
    critical: true,
    expiresAt: new Date(Date.now() + 300_000).toISOString(),
    message: { to: 'user@example.com', subject: 'Code', text: challengeId },
  };
}

function job(data: EnqueueEmailInput, retryCount = 0): Job<EnqueueEmailInput> {
  return {
    id: `job-${data.idempotencyKey}`,
    name: 'email.send',
    data,
    expireInSeconds: 60,
    heartbeatSeconds: null,
    retryCount,
    signal: new AbortController().signal,
  };
}

async function createWorker() {
  function model() {
    const first = vi
      .fn<() => Promise<ChallengeStatus | null>>()
      .mockResolvedValue(activeChallenge());
    const select = vi.fn().mockReturnValue({ first });
    const orderBy = vi.fn().mockReturnValue({ select });
    return { where: vi.fn().mockReturnValue({ orderBy }), first };
  }
  const models = {
    EmailVerificationChallenge: model(),
    PasswordResetChallenge: model(),
    OAuthLinkChallenge: model(),
  };
  const work = vi
    .fn<
      (
        name: string,
        options: WorkOptions,
        handler: WorkHandler<EnqueueEmailInput, void>,
      ) => Promise<string>
    >()
    .mockResolvedValue('worker-id');
  const send = vi
    .fn<EmailTransport['send']>()
    .mockResolvedValue({ provider: 'resend', messageId: 'message-id' });
  const module = await Test.createTestingModule({
    providers: [
      {
        provide: PgBossService,
        useValue: {
          client: { createQueue: vi.fn().mockResolvedValue(undefined), work },
        },
      },
      { provide: EMAIL_TRANSPORT, useValue: { send } },
      {
        provide: PinoLogger,
        useValue: { setContext: vi.fn(), info: vi.fn(), warn: vi.fn() },
      },
      {
        provide: PrismaService,
        useValue: { db: { orm: { public: models } } },
      },
      {
        provide: PgBossEmailQueue,
        useFactory: (
          boss: PgBossService,
          transport: EmailTransport,
          logger: PinoLogger,
          prisma: PrismaService,
        ) => new PgBossEmailQueue(boss, transport, logger, prisma),
        inject: [PgBossService, EMAIL_TRANSPORT, PinoLogger, PrismaService],
      },
    ],
  }).compile();
  onTestFinished(() => module.close());
  await module.get(PgBossEmailQueue).onApplicationBootstrap();
  const handler = work.mock.calls[0]?.[2];
  if (!handler) throw new Error('Email worker was not registered');
  return { handler, models, send };
}

describe.each<{
  kind: OtpEmailInput['kind'];
  modelName:
    | 'EmailVerificationChallenge'
    | 'PasswordResetChallenge'
    | 'OAuthLinkChallenge';
}>([
  { kind: 'registration_otp', modelName: 'EmailVerificationChallenge' },
  { kind: 'password_reset_otp', modelName: 'PasswordResetChallenge' },
  { kind: 'oauth_link_challenge_otp', modelName: 'OAuthLinkChallenge' },
])('$kind delivery', ({ kind, modelName }) => {
  it('skips an old retry after a newer code has been sent', async () => {
    const { handler, models, send } = await createWorker();
    const oldJob = job(emailInput(kind));
    send.mockRejectedValueOnce(new Error('Provider unavailable'));

    await expect(handler([oldJob])).rejects.toThrow('Email delivery failed');

    models[modelName].first.mockResolvedValue(activeChallenge('new-challenge'));
    const newJob = job(emailInput(kind, 'new-challenge'));
    await handler([newJob]);
    await handler([{ ...oldJob, retryCount: 1 }]);

    expect(send).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenLastCalledWith(
      { ...newJob.data.message, idempotencyKey: 'new-challenge' },
      newJob.signal,
    );
    expect(models[modelName].first).toHaveBeenCalledTimes(3);
    expect(models[modelName].where).toHaveBeenCalledWith({
      userId: 'user-id',
      ...(kind === 'registration_otp' ? { purpose: 'REGISTRATION' } : {}),
    });
  });

  it.each([
    ['missing', null],
    ['replaced', activeChallenge('new-challenge')],
    ['consumed', { ...activeChallenge(), consumedAt: Temporal.Now.instant() }],
    [
      'expired in the database',
      {
        ...activeChallenge(),
        expiresAt: Temporal.Now.instant().subtract({ minutes: 1 }),
      },
    ],
    ['out of attempts', { ...activeChallenge(), attemptCount: 5 }],
    [
      'replaced and consumed',
      {
        ...activeChallenge('new-challenge'),
        consumedAt: Temporal.Now.instant(),
      },
    ],
  ])('skips a challenge that is %s', async (_reason, challenge) => {
    const { handler, models, send } = await createWorker();
    models[modelName].first.mockResolvedValue(challenge);

    await expect(handler([job(emailInput(kind))])).resolves.toBeUndefined();

    expect(send).not.toHaveBeenCalled();
  });

  it.each([true, false])(
    'skips legacy jobs without a challenge ID, expiry present: %s',
    async (hasExpiry) => {
      const { handler, models, send } = await createWorker();
      const input = emailInput(kind);
      Reflect.deleteProperty(input, 'challengeId');
      if (!hasExpiry) Reflect.deleteProperty(input, 'expiresAt');

      await handler([job(input)]);

      expect(send).not.toHaveBeenCalled();
      expect(models[modelName].first).not.toHaveBeenCalled();
    },
  );
});

describe('PgBossEmailQueue delivery checks', () => {
  it('retries a failed challenge lookup without sending unchecked mail', async () => {
    const { handler, models, send } = await createWorker();
    models.PasswordResetChallenge.first.mockRejectedValueOnce(
      new Error('Database unavailable'),
    );
    const emailJob = job(emailInput('password_reset_otp'));

    await expect(handler([emailJob])).rejects.toThrow('Database unavailable');
    expect(send).not.toHaveBeenCalled();

    await handler([{ ...emailJob, retryCount: 1 }]);

    expect(send).toHaveBeenCalledExactlyOnceWith(
      {
        ...emailJob.data.message,
        idempotencyKey: emailJob.data.idempotencyKey,
      },
      emailJob.signal,
    );
  });

  it('skips an expired job before reading its challenge', async () => {
    const { handler, models, send } = await createWorker();
    const input = emailInput('registration_otp');

    await handler([
      job({ ...input, expiresAt: new Date(Date.now() - 1).toISOString() }),
    ]);

    expect(send).not.toHaveBeenCalled();
    expect(models.EmailVerificationChallenge.first).not.toHaveBeenCalled();
  });

  it('sends account notifications without checking a challenge', async () => {
    const { handler, models, send } = await createWorker();
    const notification = job({
      kind: 'password_changed',
      userId: 'user-id',
      idempotencyKey: 'notification-id',
      critical: true,
      message: {
        to: 'user@example.com',
        subject: 'Password changed',
        text: 'Changed',
      },
    });

    await handler([notification]);

    expect(send).toHaveBeenCalledOnce();
    for (const model of Object.values(models)) {
      expect(model.first).not.toHaveBeenCalled();
    }
  });
});
