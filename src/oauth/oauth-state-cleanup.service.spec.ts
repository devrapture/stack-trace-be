import { vi } from 'vitest';
import type { OAuthStateRepository } from './oauth-state.repository.js';
import { OAuthStateCleanupService } from './oauth-state-cleanup.service.js';

describe('OAuthStateCleanupService', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('deletes states expired before the current time', async () => {
    const now = new Date('2026-10-12T08:00:00.000Z');
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const deleteExpired = vi.fn().mockResolvedValue(2);
    const repository = {
      deleteExpired,
    } as unknown as OAuthStateRepository;
    const service = new OAuthStateCleanupService(repository);

    await expect(service.cleanupExpiredStates()).resolves.toBe(2);

    expect(deleteExpired).toHaveBeenCalledWith(now);
  });
});
