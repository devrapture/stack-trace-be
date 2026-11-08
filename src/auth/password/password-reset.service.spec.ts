import type { PinoLogger } from 'nestjs-pino';
import { vi } from 'vitest';
import type { AuditLogRepository } from '../../audit/audit-log.repository.js';
import type { EmailQueue } from '../../email/email-queue.js';
import type { TransactionClient } from '../../prisma/db.js';
import type { PrismaUnitOfWork } from '../../prisma/prisma-unit-of-work.js';
import type { AuthSessionsRepository } from '../../sessions/auth-sessions.repository.js';
import type { UserProfile } from '../../users/user.model.js';
import type { UsersRepository } from '../../users/users.repository.js';
import type { OtpService } from '../email-verification/otp.service.js';
import {
  OTP_RESEND_COOLDOWN_MS,
  OTP_TTL_MS,
} from '../email-verification/otp.service.js';
import type { PasswordCredentialsRepository } from './password-credentials.repository.js';
import type { PasswordResetChallengesRepository } from './password-reset.repository.js';
import { PasswordResetService } from './password-reset.service.js';
import type { PasswordHasher } from './password.hasher.js';

const genericResponse = {
  message:
    'If an account with this email can reset its password, instructions have been sent.',
};

const activeUser: UserProfile = {
  id: 'user-id',
  publicId: 'public-id',
  role: 'PLAYER',
  status: 'ACTIVE',
  avatarUrl: null,
  primaryEmail: {
    display: 'User@example.com',
    normalized: 'user@example.com',
    verified: true,
  },
  lastLoginAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function createService(options?: {
  user?: UserProfile | null;
  passwordHash?: string | null;
  noticeCooldownClaimed?: boolean;
  challengeClaimed?: boolean;
  otpCorrect?: boolean;
  challengeConsumed?: boolean;
}) {
  const users = {
    getUserByNormalizedEmail: vi
      .fn()
      .mockResolvedValue(
        options?.user === undefined ? activeUser : options.user,
      ),
    lockForUpdate: vi.fn().mockResolvedValue(undefined),
  } as unknown as UsersRepository;
  const passwords = {
    findHashByUserId: vi
      .fn()
      .mockResolvedValue(
        options?.passwordHash === undefined
          ? 'existing-password-hash'
          : options.passwordHash,
      ),
    updateHashForUser: vi.fn().mockResolvedValue(undefined),
  } as unknown as PasswordCredentialsRepository;
  const email = {
    enqueue: vi
      .fn<EmailQueue['enqueue']>()
      .mockResolvedValue({ jobId: 'job-id' }),
  } satisfies EmailQueue;
  const challenges = {
    claimNoticeCooldown: vi
      .fn()
      .mockResolvedValue(options?.noticeCooldownClaimed ?? true),
    mostRecentIssuedAt: vi.fn().mockResolvedValue(null),
    invalidateActiveAndCreate: vi.fn().mockResolvedValue('challenge-id'),
    claimAttempt: vi.fn().mockResolvedValue(
      options?.challengeClaimed === false
        ? null
        : {
            id: 'challenge-id',
            otpHash: 'otp-hash',
            expiresAt: new Date(Date.now() + 60_000),
            attemptCount: 1,
            maxAttempts: 5,
          },
    ),
    consumeIfActive: vi
      .fn()
      .mockResolvedValue(options?.challengeConsumed ?? true),
  } as unknown as PasswordResetChallengesRepository;
  const transaction = {} as TransactionClient;
  const unitOfWork = {
    run: vi.fn(async (work: (tx: TransactionClient) => Promise<unknown>) =>
      work(transaction),
    ),
  } as unknown as PrismaUnitOfWork;
  const sessions = {
    revokeAllForUser: vi.fn().mockResolvedValue(undefined),
  } as unknown as AuthSessionsRepository;
  const auditLog = {
    record: vi.fn().mockResolvedValue(undefined),
  } as unknown as AuditLogRepository;
  const logger = {
    error: vi.fn(),
  } as unknown as PinoLogger;
  const otp = {
    generate: vi.fn().mockReturnValue('123456'),
    hash: vi.fn().mockReturnValue('otp-hash'),
    verify: vi.fn().mockReturnValue(options?.otpCorrect ?? true),
  } as unknown as OtpService;
  const hasher = {
    hash: vi.fn().mockResolvedValue('new-password-hash'),
  } as unknown as PasswordHasher;

  return {
    service: new PasswordResetService(
      users,
      passwords,
      email,
      challenges,
      unitOfWork,
      sessions,
      auditLog,
      logger,
      otp,
      hasher,
    ),
    auditLog,
    challenges,
    email,
    hasher,
    logger,
    otp,
    passwords,
    sessions,
    transaction,
    unitOfWork,
    users,
  };
}

describe('PasswordResetService.forgotPassword', () => {
  it('queues a reset OTP with the same expiry as the persisted challenge', async () => {
    vi.useFakeTimers();
    try {
      const now = new Date('2026-11-08T12:00:00.000Z');
      vi.setSystemTime(now);
      const { service, challenges, email } = createService();
      vi.mocked(challenges.invalidateActiveAndCreate).mockImplementation(
        async () => {
          vi.advanceTimersByTime(1_000);
          return 'challenge-id';
        },
      );
      const expiresAt = new Date(now.getTime() + OTP_TTL_MS);

      await expect(
        service.forgotPassword({ email: 'User@example.com' }),
      ).resolves.toEqual(genericResponse);

      expect(challenges.invalidateActiveAndCreate).toHaveBeenCalledWith(
        expect.objectContaining({ expiresAt }),
      );
      expect(email.enqueue).toHaveBeenCalledExactlyOnceWith({
        kind: 'password_reset_otp',
        challengeId: 'challenge-id',
        userId: activeUser.id,
        critical: true,
        idempotencyKey: expect.any(String),
        expiresAt: expiresAt.toISOString(),
        message: expect.objectContaining({
          to: 'User@example.com',
          text: expect.stringContaining('123456'),
        }),
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it.each([
    [
      {
        user: {
          ...activeUser,
          status: 'PENDING' as const,
          primaryEmail: { ...activeUser.primaryEmail!, verified: false },
        },
      },
      'unverified_account_password_reset_notice',
    ],
    [{ passwordHash: null }, 'oauth_only_account_notice'],
  ])(
    'queues a recovery notice without an expiry for %j',
    async (options, kind) => {
      const { service, challenges, email } = createService(options);

      await expect(
        service.forgotPassword({ email: 'User@example.com' }),
      ).resolves.toEqual(genericResponse);

      expect(email.enqueue).toHaveBeenCalledExactlyOnceWith({
        kind,
        userId: activeUser.id,
        critical: true,
        idempotencyKey: expect.any(String),
        message: expect.objectContaining({ to: 'User@example.com' }),
      });
      expect(challenges.invalidateActiveAndCreate).not.toHaveBeenCalled();
    },
  );

  it.each([
    [
      'unverified account notice',
      {
        user: {
          ...activeUser,
          status: 'PENDING' as const,
          primaryEmail: {
            ...activeUser.primaryEmail!,
            verified: false,
          },
        },
      },
      'unverified_account_password_reset_notice',
    ],
    [
      'OAuth-only account notice',
      { user: activeUser, passwordHash: null },
      'oauth_only_account_notice',
    ],
    [
      'password reset OTP',
      { user: activeUser, passwordHash: 'existing-password-hash' },
      'password_reset_otp',
    ],
  ])(
    'returns the generic response when the %s delivery fails',
    async (_name, options, notification) => {
      const { service, email, logger } = createService(options);
      vi.mocked(email.enqueue).mockRejectedValue(
        new Error('Delivery failed for User@example.com'),
      );

      await expect(
        service.forgotPassword({ email: 'User@example.com' }),
      ).resolves.toEqual(genericResponse);

      expect(logger.error).toHaveBeenCalledWith(
        {
          userId: activeUser.id,
          notification,
          errorName: 'Error',
        },
        'Recovery email delivery failed',
      );
      expect(JSON.stringify(vi.mocked(logger.error).mock.calls)).not.toContain(
        'User@example.com',
      );
    },
  );

  it.each([
    [
      'unverified account',
      {
        ...activeUser,
        status: 'PENDING' as const,
        primaryEmail: { ...activeUser.primaryEmail!, verified: false },
      },
      'existing-password-hash',
    ],
    ['OAuth-only account', activeUser, null],
  ])(
    'does not send another notice during the %s cooldown',
    async (_name, user, passwordHash) => {
      const { service, challenges, email } = createService({
        user,
        passwordHash,
        noticeCooldownClaimed: false,
      });

      await expect(
        service.forgotPassword({ email: 'user@example.com' }),
      ).resolves.toEqual(genericResponse);

      expect(challenges.claimNoticeCooldown).toHaveBeenCalledWith(
        activeUser.id,
        OTP_RESEND_COOLDOWN_MS,
      );
      expect(email.enqueue).not.toHaveBeenCalled();
    },
  );
});

describe('PasswordResetService.resetPassword', () => {
  const dto = {
    email: 'user@example.com',
    otp: '123456',
    newPassword: 'new-secure-password',
  };

  it('returns success and logs when the reset notification cannot be queued', async () => {
    const { service, email, logger } = createService();
    email.enqueue.mockRejectedValue(new Error('Queue unavailable'));

    await expect(service.resetPassword(dto)).resolves.toEqual({
      message:
        'Your password has been reset. You have been signed out on every other device.',
    });

    expect(email.enqueue).toHaveBeenCalledExactlyOnceWith({
      kind: 'password_changed',
      userId: activeUser.id,
      idempotencyKey: expect.any(String),
      critical: true,
      message: expect.objectContaining({ to: dto.email }),
    });
    expect(logger.error).toHaveBeenCalledExactlyOnceWith(
      {
        userId: activeUser.id,
        notification: 'password_changed',
        errorName: 'Error',
      },
      'Recovery email delivery failed',
    );
  });

  it('rejects a request that cannot atomically claim an attempt', async () => {
    const { service, challenges, otp, unitOfWork } = createService({
      challengeClaimed: false,
    });

    await expect(service.resetPassword(dto)).rejects.toThrow(
      'That code is invalid or has expired',
    );

    expect(challenges.claimAttempt).toHaveBeenCalledWith(activeUser.id);
    expect(otp.verify).not.toHaveBeenCalled();
    expect(unitOfWork.run).not.toHaveBeenCalled();
  });

  it('rejects an incorrect OTP after its attempt has been claimed', async () => {
    const { service, challenges, otp, unitOfWork } = createService({
      otpCorrect: false,
    });

    await expect(service.resetPassword(dto)).rejects.toThrow(
      'That code is invalid or has expired',
    );

    expect(challenges.claimAttempt).toHaveBeenCalledWith(activeUser.id);
    expect(otp.verify).toHaveBeenCalledWith('123456', 'otp-hash');
    expect(unitOfWork.run).not.toHaveBeenCalled();
  });

  it('does not change the password when the challenge cannot be consumed', async () => {
    const { service, challenges, passwords, sessions, transaction } =
      createService({ challengeConsumed: false });

    await expect(service.resetPassword(dto)).rejects.toThrow(
      'That code is invalid or has expired',
    );

    expect(challenges.consumeIfActive).toHaveBeenCalledWith(
      'challenge-id',
      transaction,
    );
    expect(passwords.updateHashForUser).not.toHaveBeenCalled();
    expect(sessions.revokeAllForUser).not.toHaveBeenCalled();
  });

  it('locks the user before consuming the challenge and revoking sessions', async () => {
    const {
      service,
      auditLog,
      challenges,
      passwords,
      sessions,
      transaction,
      users,
    } = createService();

    await expect(service.resetPassword(dto)).resolves.toEqual({
      message:
        'Your password has been reset. You have been signed out on every other device.',
    });

    expect(challenges.consumeIfActive).toHaveBeenCalledWith(
      'challenge-id',
      transaction,
    );
    expect(users.lockForUpdate).toHaveBeenCalledWith(
      activeUser.id,
      transaction,
    );
    expect(passwords.updateHashForUser).toHaveBeenCalledWith(
      activeUser.id,
      'new-password-hash',
      transaction,
    );
    expect(
      vi.mocked(users.lockForUpdate).mock.invocationCallOrder[0],
    ).toBeLessThan(
      vi.mocked(challenges.consumeIfActive).mock.invocationCallOrder[0],
    );
    expect(
      vi.mocked(challenges.consumeIfActive).mock.invocationCallOrder[0],
    ).toBeLessThan(
      vi.mocked(passwords.updateHashForUser).mock.invocationCallOrder[0],
    );
    expect(sessions.revokeAllForUser).toHaveBeenCalledWith(
      activeUser.id,
      'PASSWORD_CHANGE',
      undefined,
      transaction,
    );
    expect(
      vi.mocked(users.lockForUpdate).mock.invocationCallOrder[0],
    ).toBeLessThan(
      vi.mocked(sessions.revokeAllForUser).mock.invocationCallOrder[0],
    );
    expect(auditLog.record).toHaveBeenCalledWith(
      {
        userId: activeUser.id,
        eventType: 'PASSWORD_RESET',
      },
      transaction,
    );
  });
});
