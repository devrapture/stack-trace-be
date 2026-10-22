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
      {} as never,
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
    const send = vi.fn().mockResolvedValue({
      provider: 'resend',
      messageId: 'message-id',
    });
    const logger = { error: vi.fn() };
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
      { send } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      logger as never,
    );

    return {
      service,
      tx,
      findHashByUserId,
      listForUser,
      deleteForUser,
      record,
      lockForUpdate,
      getUserById,
      send,
      logger,
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

  it('does not fail the completed unlink when its notification fails', async () => {
    const { service, getUserById, send, logger, deleteForUser } = createService(
      [
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
      ],
    );
    getUserById.mockResolvedValueOnce({
      primaryEmail: { display: 'user@example.com' },
    } as never);
    const deliveryError = new Error('Resend unavailable');
    send.mockRejectedValueOnce(deliveryError);

    await expect(
      service.unlinkProvider('user-id', 'GOOGLE'),
    ).resolves.toBeUndefined();

    expect(deleteForUser).toHaveBeenCalledOnce();
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        err: deliveryError,
        userId: 'user-id',
        provider: 'GOOGLE',
        notification: 'provider_unlinked',
      }),
      'Provider change succeeded, but the notification email failed',
    );
  });
});

describe('IdentityLinkingService post-link notifications', () => {
  function createService() {
    const tx = { kind: 'transaction' };
    const user = {
      id: 'user-id',
      primaryEmail: { display: 'user@example.com' },
    };
    const challenge = {
      id: 'challenge-id',
      provider: 'GOOGLE' as const,
      providerSubject: 'google-subject',
      otpHash: 'otp-hash',
      expiresAt: new Date(Date.now() + 60_000),
      attemptCount: 0,
      maxAttempts: 5,
    };
    const issuedSession = { accessToken: 'access-token' };
    const createForUser = vi.fn().mockResolvedValue(undefined);
    const record = vi.fn().mockResolvedValue(undefined);
    const send = vi.fn().mockRejectedValue(new Error('Resend unavailable'));
    const createSession = vi.fn().mockResolvedValue(issuedSession);
    const logger = { error: vi.fn() };
    const run = vi.fn(async (work: (transaction: typeof tx) => Promise<void>) =>
      work(tx),
    );

    const service = new IdentityLinkingService(
      {} as never,
      {
        findUserIdByProviderSubject: vi.fn().mockResolvedValue(null),
        listForUser: vi.fn().mockResolvedValue([]),
        createForUser,
      } as never,
      {} as never,
      { run } as never,
      { record } as never,
      {
        getUserByNormalizedEmail: vi.fn().mockResolvedValue(user),
        getUserById: vi.fn().mockResolvedValue(user),
      } as never,
      { send } as never,
      {
        findActiveForUser: vi.fn().mockResolvedValue(challenge),
        markConsumed: vi.fn().mockResolvedValue(true),
      } as never,
      { verify: vi.fn().mockReturnValue(true) } as never,
      { createSession } as never,
      {} as never,
      logger as never,
    );

    return {
      service,
      issuedSession,
      createForUser,
      createSession,
      send,
      logger,
    };
  }

  it('creates a session after confirmLink even when its notification fails', async () => {
    const { service, issuedSession, createForUser, createSession, logger } =
      createService();

    await expect(
      service.confirmLink({
        email: 'user@example.com',
        otp: '123456',
        clientType: 'WEB',
      }),
    ).resolves.toBe(issuedSession);

    expect(createForUser).toHaveBeenCalledOnce();
    expect(createSession).toHaveBeenCalledWith('user-id', {
      clientType: 'WEB',
    });
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-id',
        provider: 'GOOGLE',
        notification: 'provider_linked',
      }),
      'Provider change succeeded, but the notification email failed',
    );
  });

  it('does not fail an explicit link when its notification fails', async () => {
    const { service, createForUser, logger } = createService();

    await expect(
      service.completeExplicitLink(
        {
          linkingUserId: 'user-id',
          provider: 'GOOGLE',
        } as never,
        { providerSubject: 'google-subject' } as never,
      ),
    ).resolves.toBeUndefined();

    expect(createForUser).toHaveBeenCalledOnce();
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-id',
        provider: 'GOOGLE',
        notification: 'provider_linked',
      }),
      'Provider change succeeded, but the notification email failed',
    );
  });
});
