import { HttpStatus } from '@nestjs/common';
import { vi } from 'vitest';
import { AppError } from '../common/error/app-error.js';
import type { SessionService } from '../sessions/session.service.js';
import type { UserProfile } from '../users/user.model.js';
import type { UsersRepository } from '../users/users.repository.js';
import { LoginService } from './login.service.js';
import type { PasswordCredentialsRepository } from './password/password-credentials.repository.js';
import type { PasswordHasher } from './password/password.hasher.js';

const activeUser: UserProfile = {
  id: 'user-id',
  publicId: 'public-id',
  role: 'PLAYER',
  status: 'ACTIVE',
  avatarUrl: null,
  primaryEmail: {
    display: 'user@example.com',
    normalized: 'user@example.com',
    verified: true,
  },
  lastLoginAt: null,
  createdAt: new Date('2026-10-05T12:00:00Z'),
  updatedAt: new Date('2026-10-05T12:00:00Z'),
};

function createService(user: UserProfile) {
  const users = {
    getUserByNormalizedEmail: vi.fn().mockResolvedValue(user),
  } as unknown as UsersRepository;
  const passwords = {
    findHashByUserId: vi.fn().mockResolvedValue('password-hash'),
  } as unknown as PasswordCredentialsRepository;
  const hasher = {
    verify: vi.fn().mockResolvedValue(true),
    needsRehash: vi.fn().mockReturnValue(false),
  } as unknown as PasswordHasher;
  const sessions = {
    createSession: vi.fn(),
  } as unknown as SessionService;

  return {
    service: new LoginService(users, passwords, hasher, sessions),
    createSession: sessions.createSession,
  };
}

describe('LoginService', () => {
  it('keeps the email-verification response for a pending registration', async () => {
    const { service, createSession } = createService({
      ...activeUser,
      status: 'PENDING',
      primaryEmail: { ...activeUser.primaryEmail!, verified: false },
    });

    const result = service.login({
      email: 'user@example.com',
      password: 'correct-password',
      clientType: 'WEB',
      deviceName: 'Test browser',
    });

    await expect(result).rejects.toMatchObject({
      code: 'email_not_verified',
      httpStatus: HttpStatus.FORBIDDEN,
    } satisfies Partial<AppError>);
    expect(createSession).not.toHaveBeenCalled();
  });

  it.each(['SUSPENDED', 'DELETED'] as const)(
    'does not create a session for a %s user',
    async (status) => {
      const { service, createSession } = createService({
        ...activeUser,
        status,
      });

      const result = service.login({
        email: 'user@example.com',
        password: 'correct-password',
        clientType: 'WEB',
        deviceName: 'Test browser',
      });

      await expect(result).rejects.toMatchObject({
        code: 'unauthorized',
        httpStatus: HttpStatus.UNAUTHORIZED,
      } satisfies Partial<AppError>);
      expect(createSession).not.toHaveBeenCalled();
    },
  );
});
