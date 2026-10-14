import { vi } from 'vitest';
import type { UserProfile } from '../users/user.model.js';
import type { UsersRepository } from '../users/users.repository.js';
import type { AccessTokenService } from './access-token.service.js';
import type {
  AuthSessionFields,
  AuthSessionsRepository,
} from './auth-sessions.repository.js';
import { InvalidRefreshTokenError } from './session-errors.js';
import { SessionService } from './session.service.js';

const session: AuthSessionFields = {
  id: 'session-id',
  userId: 'user-id',
  refreshTokenHash: 'refresh-token-hash',
  previousTokenHash: null,
  clientType: 'WEB',
  deviceName: null,
  createdAt: new Date('2026-10-05T12:00:00Z'),
  updatedAt: new Date('2026-10-05T12:00:00Z'),
  lastUsedAt: new Date('2026-10-05T12:00:00Z'),
  expiresAt: new Date('2100-01-01T00:00:00Z'),
  revokedAt: null,
  revokedReason: null,
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

function createService(user: UserProfile | null) {
  const sessions = {
    findByCurrentOrPreviousHash: vi.fn().mockResolvedValue(session),
    revoke: vi.fn().mockResolvedValue(undefined),
    rotate: vi.fn(),
  } as unknown as AuthSessionsRepository;
  const accessTokens = { sign: vi.fn() } as unknown as AccessTokenService;
  const users = {
    getUserById: vi.fn().mockResolvedValue(user),
  } as unknown as UsersRepository;

  return {
    service: new SessionService(sessions, accessTokens, users),
    revoke: sessions.revoke,
    rotate: sessions.rotate,
  };
}

describe('SessionService.rotateRefreshToken', () => {
  it.each(['SUSPENDED', 'DELETED'] as const)(
    'revokes the session and rejects refresh for a %s user',
    async (status) => {
      const { service, revoke, rotate } = createService({
        ...activeUser,
        status,
      });

      await expect(
        service.rotateRefreshToken('refresh-token'),
      ).rejects.toBeInstanceOf(InvalidRefreshTokenError);
      expect(revoke).toHaveBeenCalledWith('session-id', 'ADMIN');
      expect(rotate).not.toHaveBeenCalled();
    },
  );
});
