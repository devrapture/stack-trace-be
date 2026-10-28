import { Temporal } from 'temporal-polyfill/full';
import { vi } from 'vitest';
import type { PrismaService } from '../prisma/prisma.service.js';
import { PrismaOAuthStateRepository } from './prisma-oauth-state.repository.js';

const EXPIRES_AT = Temporal.Instant.from('2026-10-12T00:00:00Z');
const CONSUMED_AT = Temporal.Instant.from('2026-10-11T23:30:00Z');

describe('PrismaOAuthStateRepository', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('converts a Date expiry to Temporal.Instant when creating state', async () => {
    const create = vi.fn().mockResolvedValue(undefined);
    const prisma = {
      db: {
        orm: {
          public: {
            OAuthState: { create },
          },
        },
      },
    } as unknown as PrismaService;
    const repository = new PrismaOAuthStateRepository(prisma);

    await repository.create({
      provider: 'GOOGLE',
      intent: 'LOGIN',
      state: 'oauth-state',
      redirectUri: 'http://localhost:3000/api/v1/oauth/google/callback',
      clientType: 'OTHER',
      expiresAt: new Date(EXPIRES_AT.epochMilliseconds),
    });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        expiresAt: EXPIRES_AT,
      }),
    );
  });

  it('stores the initiating session for link state', async () => {
    const create = vi.fn().mockResolvedValue(undefined);
    const prisma = {
      db: {
        orm: {
          public: {
            OAuthState: { create },
          },
        },
      },
    } as unknown as PrismaService;
    const repository = new PrismaOAuthStateRepository(prisma);

    await repository.create({
      provider: 'GOOGLE',
      intent: 'LINK',
      state: 'oauth-state',
      redirectUri: 'http://localhost:3000/api/v1/oauth/google/callback',
      clientType: 'WEB',
      linkingUserId: 'user-id',
      linkingSessionId: 'session-id',
      expiresAt: new Date(EXPIRES_AT.epochMilliseconds),
    });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        linkingUserId: 'user-id',
        linkingSessionId: 'session-id',
      }),
    );
  });

  it('uses Temporal.Instant when consuming and maps timestamps to Date', async () => {
    vi.spyOn(Temporal.Now, 'instant').mockReturnValue(CONSUMED_AT);
    const updateAndCount = vi.fn().mockResolvedValue(1);
    const first = vi.fn().mockResolvedValue({
      id: 'oauth-state-id',
      provider: 'GOOGLE',
      intent: 'LOGIN',
      nonce: 'nonce',
      pkceVerifier: 'verifier',
      redirectUri: 'http://localhost:3000/api/v1/oauth/google/callback',
      clientType: 'OTHER',
      linkingUserId: null,
      linkingSessionId: null,
      expiresAt: EXPIRES_AT,
      consumedAt: CONSUMED_AT,
    });
    const where = vi
      .fn()
      .mockReturnValueOnce({ updateAndCount })
      .mockReturnValueOnce({ first });
    const prisma = {
      db: {
        orm: {
          public: {
            OAuthState: { where },
          },
        },
      },
    } as unknown as PrismaService;
    const repository = new PrismaOAuthStateRepository(prisma);

    const result = await repository.consume('oauth-state');

    expect(updateAndCount).toHaveBeenCalledWith({
      consumedAt: CONSUMED_AT,
    });
    expect(result?.expiresAt).toEqual(new Date(EXPIRES_AT.epochMilliseconds));
    expect(result?.consumedAt).toEqual(new Date(CONSUMED_AT.epochMilliseconds));
    expect(result?.linkingSessionId).toBeNull();
  });

  it('deletes states that expired before the cutoff', async () => {
    const expiresAtLt = vi.fn();
    const deleteAndCount = vi.fn().mockResolvedValue(3);
    const where = vi.fn().mockImplementation((predicate) => {
      predicate({ expiresAt: { lt: expiresAtLt } });
      return { deleteAndCount };
    });
    const prisma = {
      db: {
        orm: {
          public: {
            OAuthState: { where },
          },
        },
      },
    } as unknown as PrismaService;
    const repository = new PrismaOAuthStateRepository(prisma);

    await expect(
      repository.deleteExpired(new Date(EXPIRES_AT.epochMilliseconds)),
    ).resolves.toBe(3);

    expect(expiresAtLt).toHaveBeenCalledWith(EXPIRES_AT);
    expect(deleteAndCount).toHaveBeenCalledOnce();
  });
});
