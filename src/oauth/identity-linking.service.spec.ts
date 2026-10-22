import { vi } from 'vitest';
import { ErrorCode } from '../common/error/error-codes.js';
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

describe('IdentityLinkingService.unlinkProvider', () => {
  function createService(
    oauthIdentities: Array<{
      provider: 'GOOGLE' | 'GITHUB';
      providerSubject: string;
      createdAt: Date;
    }>,
  ) {
    const tx = { kind: 'transaction' };
    const findHashByUserId = vi.fn().mockResolvedValue(null);
    const listForUser = vi.fn().mockResolvedValue(oauthIdentities);
    const deleteForUser = vi.fn().mockResolvedValue(undefined);
    const record = vi.fn().mockResolvedValue(undefined);
    const lockForUpdate = vi.fn().mockResolvedValue(undefined);
    const getUserById = vi.fn().mockResolvedValue(null);
    const run = vi.fn(async (work: (transaction: typeof tx) => Promise<void>) =>
      work(tx),
    );

    const service = new IdentityLinkingService(
      { findHashByUserId } as never,
      { listForUser, deleteForUser } as never,
      {} as never,
      { run } as never,
      { record } as never,
      { lockForUpdate, getUserById } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    return {
      service,
      tx,
      findHashByUserId,
      listForUser,
      deleteForUser,
      record,
      lockForUpdate,
    };
  }

  it('locks the user and checks all sign-in methods in the delete transaction', async () => {
    const {
      service,
      tx,
      findHashByUserId,
      listForUser,
      deleteForUser,
      record,
      lockForUpdate,
    } = createService([
      {
        provider: 'GOOGLE',
        providerSubject: 'google-subject',
        createdAt: new Date('2026-10-22T00:00:00.000Z'),
      },
      {
        provider: 'GITHUB',
        providerSubject: 'github-subject',
        createdAt: new Date('2026-10-22T00:00:00.000Z'),
      },
    ]);

    await expect(
      service.unlinkProvider('user-id', 'GOOGLE'),
    ).resolves.toBeUndefined();

    expect(lockForUpdate).toHaveBeenCalledWith('user-id', tx);
    expect(findHashByUserId).toHaveBeenCalledWith('user-id', tx);
    expect(listForUser).toHaveBeenCalledWith('user-id', tx);
    expect(deleteForUser).toHaveBeenCalledWith('user-id', 'GOOGLE', tx);
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-id',
        eventType: 'PROVIDER_UNLINKED',
      }),
      tx,
    );
    expect(lockForUpdate.mock.invocationCallOrder[0]).toBeLessThan(
      findHashByUserId.mock.invocationCallOrder[0],
    );
    expect(lockForUpdate.mock.invocationCallOrder[0]).toBeLessThan(
      listForUser.mock.invocationCallOrder[0],
    );
  });

  it('does not delete the last sign-in method after taking the lock', async () => {
    const { service, deleteForUser, record, lockForUpdate } = createService([
      {
        provider: 'GOOGLE',
        providerSubject: 'google-subject',
        createdAt: new Date('2026-10-22T00:00:00.000Z'),
      },
    ]);

    await expect(service.unlinkProvider('user-id', 'GOOGLE')).rejects.toEqual(
      expect.objectContaining({
        code: ErrorCode.CANNOT_REMOVE_LAST_AUTH_METHOD,
      }),
    );

    expect(lockForUpdate).toHaveBeenCalledOnce();
    expect(deleteForUser).not.toHaveBeenCalled();
    expect(record).not.toHaveBeenCalled();
  });
});
