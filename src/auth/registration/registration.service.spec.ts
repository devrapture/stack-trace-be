import { vi } from 'vitest';
import type { EmailProvider } from '../../email/email-provider.js';
import type { UserProfile } from '../../users/user.model.js';
import type { UsersRepository } from '../../users/users.repository.js';
import type { EmailVerificationChallengesRepository } from '../email-verification/email-verification.repository.js';
import type { OtpService } from '../email-verification/otp.service.js';
import type { PasswordCredentialsRepository } from '../password/password-credentials.repository.js';
import type { PasswordHasher } from '../password/password.hasher.js';
import { RegistrationService } from './registration.service.js';

const pendingUser: UserProfile = {
  id: 'user-id',
  publicId: 'public-id',
  role: 'PLAYER',
  status: 'PENDING',
  avatarUrl: null,
  primaryEmail: {
    display: 'coolpythoncodes@gmail.com',
    normalized: 'coolpythoncodes@gmail.com',
    verified: false,
  },
  lastLoginAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function createService(user: UserProfile) {
  const users = {
    getUserByNormalizedEmail: vi.fn().mockResolvedValue(user),
  } as unknown as UsersRepository;

  const passwords = {
    findHashByUserId: vi.fn().mockResolvedValue('existing-hash'),
    updateHashForUser: vi.fn().mockResolvedValue(undefined),
  } as unknown as PasswordCredentialsRepository;

  const challenges = {
    issueWithCooldown: vi.fn().mockResolvedValue(undefined),
  } as unknown as EmailVerificationChallengesRepository;

  const email = {
    send: vi
      .fn()
      .mockResolvedValue({ provider: 'resend', messageId: 'test-id' }),
  } as unknown as EmailProvider;

  const hasher = {
    hash: vi.fn().mockResolvedValue('new-hash'),
  } as unknown as PasswordHasher;

  const otp = {
    generate: vi.fn().mockReturnValue('123456'),
    hash: vi.fn().mockReturnValue('otp-hash'),
  } as unknown as OtpService;

  return {
    service: new RegistrationService(
      users,
      passwords,
      challenges,
      email,
      hasher,
      otp,
    ),
    passwords,
    challenges,
    email,
  };
}

describe('RegistrationService.register with an existing email', () => {
  it('resumes a pending password registration and sends an OTP', async () => {
    const { service, passwords, challenges, email } =
      createService(pendingUser);

    await service.register({
      email: ' CoolPythonCodes@gmail.com ',
      password: 'new-password',
    });

    expect(challenges.issueWithCooldown).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: pendingUser.id,
        purpose: 'REGISTRATION',
        otpHash: 'otp-hash',
        passwordHash: 'new-hash',
      }),
    );
    expect(passwords.updateHashForUser).not.toHaveBeenCalled();

    expect(email.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: pendingUser.primaryEmail?.display,
        subject: 'Verify your email to join Stack Trace',
      }),
    );
  });

  it('sends an account notice instead of an OTP for an active account', async () => {
    const { service, challenges, email } = createService({
      ...pendingUser,
      status: 'ACTIVE',
    });

    await service.register({
      email: 'coolpythoncodes@gmail.com',
      password: 'new-password',
    });

    expect(challenges.issueWithCooldown).not.toHaveBeenCalled();

    expect(email.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: pendingUser.primaryEmail?.normalized,
        subject: 'Someone tried to register with your email',
      }),
    );
  });

  it('does not send an OTP when the cooldown rejects issuance', async () => {
    const { service, passwords, challenges, email } =
      createService(pendingUser);
    vi.mocked(challenges.issueWithCooldown).mockRejectedValue(
      new Error('Cooldown active'),
    );

    await expect(
      service.register({
        email: 'coolpythoncodes@gmail.com',
        password: 'new-password',
      }),
    ).rejects.toThrow('Cooldown active');

    expect(challenges.issueWithCooldown).toHaveBeenCalledWith(
      expect.objectContaining({ passwordHash: 'new-hash' }),
    );
    expect(passwords.updateHashForUser).not.toHaveBeenCalled();
    expect(email.send).not.toHaveBeenCalled();
  });
});
