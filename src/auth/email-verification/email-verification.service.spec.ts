import { HttpStatus } from '@nestjs/common';
import { vi } from 'vitest';
import { AppError } from '../../common/error/app-error.js';
import { ErrorCode } from '../../common/error/error-codes.js';
import type { EmailProvider } from '../../email/email-provider.js';
import type { UserProfile } from '../../users/user.model.js';
import type { UsersRepository } from '../../users/users.repository.js';
import type { EmailVerificationChallengesRepository } from './email-verification.repository.js';
import { EmailVerificationService } from './email-verification.service.js';
import type { OtpService } from './otp.service.js';

const pendingUser: UserProfile = {
  id: 'user-id',
  publicId: 'public-id',
  role: 'PLAYER',
  status: 'PENDING',
  avatarUrl: null,
  primaryEmail: {
    display: 'User@example.com',
    normalized: 'user@example.com',
    verified: false,
  },
  lastLoginAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function createService(user: UserProfile | null) {
  const users = {
    getUserByNormalizedEmail: vi.fn().mockResolvedValue(user),
  } as unknown as UsersRepository;
  const challenges = {
    issueWithCooldown: vi.fn().mockResolvedValue(undefined),
    findActive: vi.fn().mockResolvedValue({
      id: 'challenge-id',
      otpHash: 'otp-hash',
      expiresAt: new Date(Date.now() + 60_000),
      attemptCount: 0,
      maxAttempts: 5,
    }),
    incrementAttempts: vi.fn().mockResolvedValue(true),
    consumeAndVerifyEmail: vi.fn().mockResolvedValue(true),
  } as unknown as EmailVerificationChallengesRepository;
  const email = {
    send: vi
      .fn()
      .mockResolvedValue({ provider: 'resend', messageId: 'test-id' }),
  } as unknown as EmailProvider;
  const otp = {
    generate: vi.fn().mockReturnValue('123456'),
    hash: vi.fn().mockReturnValue('otp-hash'),
    verify: vi.fn().mockReturnValue(true),
  } as unknown as OtpService;

  return {
    service: new EmailVerificationService(users, challenges, email, otp),
    challenges,
    email,
    otp,
  };
}

describe('EmailVerificationService.verify', () => {
  it('verifies an email after consuming a matching challenge', async () => {
    const { service, challenges, otp } = createService(pendingUser);

    await expect(
      service.verify({ email: ' USER@example.com ', otp: '123456' }),
    ).resolves.toEqual({ verified: true });

    expect(challenges.findActive).toHaveBeenCalledWith(
      'user-id',
      'REGISTRATION',
    );
    expect(otp.verify).toHaveBeenCalledWith('123456', 'otp-hash');
    expect(challenges.consumeAndVerifyEmail).toHaveBeenCalledWith(
      'challenge-id',
      'user-id',
    );
  });

  it('rejects a missing challenge without checking the code', async () => {
    const { service, challenges, otp } = createService(pendingUser);
    vi.mocked(challenges.findActive).mockResolvedValue(null);

    await expect(
      service.verify({ email: 'user@example.com', otp: '123456' }),
    ).rejects.toThrow('That code is invalid or expired');

    expect(otp.verify).not.toHaveBeenCalled();
    expect(challenges.consumeAndVerifyEmail).not.toHaveBeenCalled();
  });

  it('records a wrong code and does not consume the challenge', async () => {
    const { service, challenges, otp } = createService(pendingUser);
    vi.mocked(otp.verify).mockReturnValue(false);

    await expect(
      service.verify({ email: 'user@example.com', otp: '000000' }),
    ).rejects.toThrow('That code is invalid or expired');

    expect(challenges.incrementAttempts).toHaveBeenCalledWith('challenge-id');
    expect(challenges.consumeAndVerifyEmail).not.toHaveBeenCalled();
  });

  it('rejects a matching code if the challenge expires before consumption', async () => {
    const { service, challenges, otp } = createService(pendingUser);
    vi.mocked(challenges.consumeAndVerifyEmail).mockResolvedValue(false);

    await expect(
      service.verify({ email: 'user@example.com', otp: '123456' }),
    ).rejects.toThrow('That code is invalid or expired');

    expect(otp.verify).toHaveBeenCalledWith('123456', 'otp-hash');
    expect(challenges.consumeAndVerifyEmail).toHaveBeenCalledWith(
      'challenge-id',
      'user-id',
    );
  });
});

describe('EmailVerificationService.resend', () => {
  it('sends a newly issued code to an unverified email', async () => {
    const { service, challenges, email } = createService(pendingUser);

    await service.resend({ email: ' USER@example.com ' });

    expect(challenges.issueWithCooldown).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: pendingUser.id,
        purpose: 'REGISTRATION',
        otpHash: 'otp-hash',
      }),
    );
    expect(email.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'user@example.com',
        subject: 'Verify your email to join Stack Trace',
        text: expect.stringContaining('123456'),
      }),
    );
  });

  it('does not issue or send a code for an unknown or verified email', async () => {
    for (const user of [
      null,
      {
        ...pendingUser,
        primaryEmail: { ...pendingUser.primaryEmail!, verified: true },
      },
    ]) {
      const { service, challenges, email } = createService(user);

      await service.resend({ email: 'user@example.com' });

      expect(challenges.issueWithCooldown).not.toHaveBeenCalled();
      expect(email.send).not.toHaveBeenCalled();
    }
  });

  it.each([
    ['cooldown', ErrorCode.RATE_LIMITED, HttpStatus.TOO_MANY_REQUESTS],
    ['concurrent issuance', ErrorCode.CONFLICT, HttpStatus.CONFLICT],
  ])(
    'returns the generic response during %s',
    async (_reason, code, status) => {
      const { service, challenges, email } = createService(pendingUser);
      vi.mocked(challenges.issueWithCooldown).mockRejectedValue(
        new AppError(code, 'Account-specific issuance error', status),
      );
      const { service: unknownService } = createService(null);
      const genericResponse = await unknownService.resend({
        email: 'user@example.com',
      });

      await expect(
        service.resend({ email: 'user@example.com' }),
      ).resolves.toEqual(genericResponse);
      expect(email.send).not.toHaveBeenCalled();
    },
  );

  it('propagates unexpected issuance errors without sending a code', async () => {
    const { service, challenges, email } = createService(pendingUser);
    vi.mocked(challenges.issueWithCooldown).mockRejectedValue(
      new Error('Database unavailable'),
    );

    await expect(service.resend({ email: 'user@example.com' })).rejects.toThrow(
      'Database unavailable',
    );
    expect(email.send).not.toHaveBeenCalled();
  });
});
