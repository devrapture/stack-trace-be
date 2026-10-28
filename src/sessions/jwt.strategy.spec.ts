import { UnauthorizedException } from '@nestjs/common';
import { vi } from 'vitest';
import type { AppConfig } from '../config/app-config.js';
import type { UserProfile } from '../users/user.model.js';
import type { UsersRepository } from '../users/users.repository.js';
import type {
  AuthSessionsRepository,
  SessionRecord,
} from './auth-sessions.repository.js';
import { JwtStrategy } from './jwt.strategy.js';

const config = {
  jwtPublicKey: 'test-public-key',
} as AppConfig;

const activeSession: SessionRecord = {
  id: 'session-id',
  userId: 'user-id',
  clientType: 'OTHER',
  deviceName: null,
  createdAt: new Date('2026-10-05T12:00:00Z'),
  lastUsedAt: new Date('2026-10-05T12:00:00Z'),
  expiresAt: new Date('2100-01-01T00:00:00Z'),
  revokedAt: null,
};

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

function createStrategy(
  session: SessionRecord | null,
  user: UserProfile | null = activeUser,
) {
  const findById = vi.fn().mockResolvedValue(session);
  const repository = { findById } as unknown as AuthSessionsRepository;
  const getUserById = vi.fn().mockResolvedValue(user);
  const users = { getUserById } as unknown as UsersRepository;

  return {
    findById,
    getUserById,
    strategy: new JwtStrategy(config, repository, users),
  };
}

describe('JwtStrategy', () => {
  it('accepts an access token whose session is active', async () => {
    const { findById, strategy } = createStrategy(activeSession);

    await expect(
      strategy.validate({ sub: 'user-id', sid: 'session-id' }),
    ).resolves.toEqual({ userId: 'user-id', sessionId: 'session-id' });
    expect(findById).toHaveBeenCalledWith('session-id');
  });

  it('rejects a token with missing identity claims without querying sessions', async () => {
    const { findById, strategy } = createStrategy(activeSession);

    await expect(
      strategy.validate({ sub: 'user-id', sid: '' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(findById).not.toHaveBeenCalled();
  });

  it.each(['SUSPENDED', 'DELETED'] as const)(
    'rejects an access token for a %s user',
    async (status) => {
      const { strategy } = createStrategy(activeSession, {
        ...activeUser,
        status,
      });

      await expect(
        strategy.validate({ sub: 'user-id', sid: 'session-id' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    },
  );

  it.each([
    ['missing', null],
    ['revoked', { ...activeSession, revokedAt: new Date() }],
    [
      'expired',
      { ...activeSession, expiresAt: new Date('2020-01-01T00:00:00Z') },
    ],
    ['owned by another user', { ...activeSession, userId: 'another-user-id' }],
  ] as const)(
    'rejects a token whose session is %s',
    async (_state, session) => {
      const { strategy } = createStrategy(session);

      await expect(
        strategy.validate({ sub: 'user-id', sid: 'session-id' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    },
  );
});
