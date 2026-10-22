import { vi } from 'vitest';
import { IdentityLinkingService } from './identity-linking.service.js';

describe('IdentityLinkingService explicit linking', () => {
  it('persists and returns the generated state before completing', async () => {
    const listForUser = vi.fn().mockResolvedValue([]);
    const createAuthorizationRequest = vi.fn().mockResolvedValue({
      authorizationUrl: 'https://accounts.google.com/authorize',
      state: 'oauth-state',
      nonce: 'oauth-nonce',
      pkceVerifier: 'pkce-verifier',
    });
    const redirectUri = 'https://api.example.com/api/v1/oauth/google/callback';
    let finishPersisting!: () => void;
    const create = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishPersisting = resolve;
        }),
    );
    const service = new IdentityLinkingService(
      {} as never,
      { listForUser } as never,
      { create } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {
        adapterFor: vi.fn().mockReturnValue({ createAuthorizationRequest }),
        redirectUriFor: vi.fn().mockReturnValue(redirectUri),
      } as never,
    );

    const start = service.startExplicitLink('user-id', 'GOOGLE', 'WEB');
    await vi.waitFor(() => expect(create).toHaveBeenCalledOnce());

    let completed = false;
    void start.then(() => {
      completed = true;
    });
    await Promise.resolve();
    expect(completed).toBe(false);

    finishPersisting();
    await expect(start).resolves.toEqual({
      authorizationUrl: 'https://accounts.google.com/authorize',
      state: 'oauth-state',
    });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        intent: 'LINK',
        provider: 'GOOGLE',
        state: 'oauth-state',
        nonce: 'oauth-nonce',
        pkceVerifier: 'pkce-verifier',
        redirectUri,
        clientType: 'WEB',
        linkingUserId: 'user-id',
      }),
    );
  });
});
