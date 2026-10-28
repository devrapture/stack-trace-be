import { Temporal } from 'temporal-polyfill/full';
import { vi } from 'vitest';
import type { PrismaService } from '../prisma/prisma.service.js';
import { PrismaOAuthLinkChallengeRepository } from './prisma-oauth-link-challenge.repository.js';

const EXPIRES_AT = Temporal.Instant.from('2026-10-20T12:00:00Z');

describe('PrismaOAuthLinkChallengeRepository', () => {
  it('converts a Date expiry to Temporal.Instant when creating a challenge', async () => {
    const create = vi.fn().mockResolvedValue(undefined);
    const prisma = {
      db: {
        orm: {
          public: {
            OAuthLinkChallenge: { create },
          },
        },
      },
    } as unknown as PrismaService;
    const repository = new PrismaOAuthLinkChallengeRepository(prisma);

    await repository.create({
      userId: 'user-id',
      provider: 'GITHUB',
      providerSubject: 'github-user-id',
      otpHash: 'otp-hash',
      expiresAt: new Date(EXPIRES_AT.epochMilliseconds),
      maxAttempts: 5,
    });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ expiresAt: EXPIRES_AT }),
    );
  });

  it('maps the Temporal.Instant expiry to Date when reading a challenge', async () => {
    const first = vi.fn().mockResolvedValue({
      id: 'challenge-id',
      provider: 'GITHUB',
      providerSubject: 'github-user-id',
      otpHash: 'otp-hash',
      attemptCount: 0,
      maxAttempts: 5,
      expiresAt: EXPIRES_AT,
    });
    const orderBy = vi.fn().mockReturnValue({ first });
    const where = vi.fn().mockReturnValue({ orderBy });
    const prisma = {
      db: {
        orm: {
          public: {
            OAuthLinkChallenge: { where },
          },
        },
      },
    } as unknown as PrismaService;
    const repository = new PrismaOAuthLinkChallengeRepository(prisma);

    const challenge = await repository.findActiveForUser('user-id');

    expect(challenge?.expiresAt).toEqual(
      new Date(EXPIRES_AT.epochMilliseconds),
    );
  });

  it('deletes challenges that expired before the cutoff', async () => {
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
            OAuthLinkChallenge: { where },
          },
        },
      },
    } as unknown as PrismaService;
    const repository = new PrismaOAuthLinkChallengeRepository(prisma);

    await expect(
      repository.deleteExpired(new Date(EXPIRES_AT.epochMilliseconds)),
    ).resolves.toBe(3);

    expect(expiresAtLt).toHaveBeenCalledWith(EXPIRES_AT);
    expect(deleteAndCount).toHaveBeenCalledOnce();
  });
});
