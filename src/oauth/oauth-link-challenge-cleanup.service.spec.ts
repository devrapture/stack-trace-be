import { vi } from 'vitest';
import type { OAuthLinkChallengeRepository } from './oauth-link-challenge.repository.js';
import { OAuthLinkChallengeCleanupService } from './oauth-link-challenge-cleanup.service.js';

describe('OAuthLinkChallengeCleanupService', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('deletes challenges expired before the current time', async () => {
    const now = new Date('2026-10-28T08:00:00.000Z');
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const deleteExpired = vi.fn().mockResolvedValue(3);
    const repository = {
      deleteExpired,
    } as unknown as OAuthLinkChallengeRepository;
    const service = new OAuthLinkChallengeCleanupService(repository);

    await expect(service.cleanupExpiredChallenges()).resolves.toBe(3);

    expect(deleteExpired).toHaveBeenCalledWith(now);
  });
});
