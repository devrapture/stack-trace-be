import { vi } from 'vitest';
import { ErrorCode } from '../common/error/error-codes.js';
import { IdentityLinkingService } from './identity-linking.service.js';
import {
  OAuthIdentityAlreadyLinkedError,
  OAuthProviderAlreadyLinkedError,
} from './oauth-identities.repository.js';

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
      {} as never,
      {
        adapterFor: vi.fn().mockReturnValue({ createAuthorizationRequest }),
        redirectUriFor: vi.fn().mockReturnValue(redirectUri),
      } as never,
      {} as never,
    );

    const start = service.startExplicitLink({
      userId: 'user-id',
      sessionId: 'session-id',
      provider: 'GOOGLE',
      clientType: 'WEB',
    });
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
        linkingSessionId: 'session-id',
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
      status: 'ACTIVE',
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
    const findUserIdByProviderSubject = vi.fn().mockResolvedValue(null);
    const record = vi.fn().mockResolvedValue(undefined);
    const send = vi.fn().mockRejectedValue(new Error('Resend unavailable'));
    const createSession = vi.fn().mockResolvedValue(issuedSession);
    const lockForUpdate = vi.fn().mockResolvedValue(undefined);
    const findByIdForUpdate = vi.fn().mockResolvedValue({
      id: 'session-id',
      userId: 'user-id',
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    });
    const logger = { error: vi.fn() };
    const run = vi.fn(async (work: (transaction: typeof tx) => Promise<void>) =>
      work(tx),
    );

    const service = new IdentityLinkingService(
      {} as never,
      {
        findUserIdByProviderSubject,
        listForUser: vi.fn().mockResolvedValue([]),
        createForUser,
      } as never,
      {} as never,
      { run } as never,
      { record } as never,
      {
        getUserByNormalizedEmail: vi.fn().mockResolvedValue(user),
        getUserById: vi.fn().mockResolvedValue(user),
        lockForUpdate,
      } as never,
      { send } as never,
      {
        findActiveForUser: vi.fn().mockResolvedValue(challenge),
        markConsumed: vi.fn().mockResolvedValue(true),
      } as never,
      { verify: vi.fn().mockReturnValue(true) } as never,
      { createSession } as never,
      { findByIdForUpdate } as never,
      {} as never,
      logger as never,
    );

    return {
      service,
      issuedSession,
      createForUser,
      findUserIdByProviderSubject,
      createSession,
      lockForUpdate,
      findByIdForUpdate,
      record,
      send,
      logger,
      tx,
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
    const { service, createForUser, findByIdForUpdate, logger, tx } =
      createService();

    await expect(
      service.completeExplicitLink(
        {
          linkingUserId: 'user-id',
          linkingSessionId: 'session-id',
          provider: 'GOOGLE',
        } as never,
        { providerSubject: 'google-subject' } as never,
      ),
    ).resolves.toBeUndefined();

    expect(createForUser).toHaveBeenCalledOnce();
    expect(findByIdForUpdate).toHaveBeenCalledWith('session-id', tx);
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-id',
        provider: 'GOOGLE',
        notification: 'provider_linked',
      }),
      'Provider change succeeded, but the notification email failed',
    );
  });

  it('locks the user before the initiating session', async () => {
    const {
      service,
      lockForUpdate,
      findByIdForUpdate,
      findUserIdByProviderSubject,
      tx,
    } = createService();

    await service.completeExplicitLink(
      {
        linkingUserId: 'user-id',
        linkingSessionId: 'session-id',
        provider: 'GOOGLE',
      } as never,
      { providerSubject: 'google-subject' } as never,
    );

    expect(lockForUpdate).toHaveBeenCalledWith('user-id', tx);
    expect(findByIdForUpdate).toHaveBeenCalledWith('session-id', tx);
    expect(findUserIdByProviderSubject).toHaveBeenCalledWith(
      'GOOGLE',
      'google-subject',
      tx,
    );
    expect(lockForUpdate.mock.invocationCallOrder[0]).toBeLessThan(
      findByIdForUpdate.mock.invocationCallOrder[0],
    );
  });

  it.each([
    ['missing', null],
    [
      'revoked',
      {
        userId: 'user-id',
        revokedAt: new Date('2026-10-28T12:00:00.000Z'),
        expiresAt: new Date(Date.now() + 60_000),
      },
    ],
    [
      'expired',
      {
        userId: 'user-id',
        revokedAt: null,
        expiresAt: new Date(Date.now() - 1),
      },
    ],
    [
      'owned by another user',
      {
        userId: 'other-user-id',
        revokedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
      },
    ],
  ])(
    'rejects an explicit link when the initiating session is %s',
    async (_label, session) => {
      const { service, createForUser, findByIdForUpdate, record } =
        createService();
      findByIdForUpdate.mockResolvedValueOnce(session);

      await expect(
        service.completeExplicitLink(
          {
            linkingUserId: 'user-id',
            linkingSessionId: 'session-id',
            provider: 'GOOGLE',
          } as never,
          { providerSubject: 'google-subject' } as never,
        ),
      ).rejects.toEqual(
        expect.objectContaining({
          code: ErrorCode.UNAUTHORIZED,
          httpStatus: 401,
        }),
      );

      expect(createForUser).not.toHaveBeenCalled();
      expect(record).not.toHaveBeenCalled();
    },
  );

  it('rejects legacy link state that has no initiating session', async () => {
    const { service, createForUser, findByIdForUpdate } = createService();

    await expect(
      service.completeExplicitLink(
        {
          linkingUserId: 'user-id',
          linkingSessionId: null,
          provider: 'GOOGLE',
        } as never,
        { providerSubject: 'google-subject' } as never,
      ),
    ).rejects.toEqual(
      expect.objectContaining({
        code: ErrorCode.UNAUTHORIZED,
        httpStatus: 401,
      }),
    );

    expect(findByIdForUpdate).not.toHaveBeenCalled();
    expect(createForUser).not.toHaveBeenCalled();
  });

  it.each([
    [new OAuthProviderAlreadyLinkedError(), ErrorCode.PROVIDER_ALREADY_LINKED],
    [
      new OAuthIdentityAlreadyLinkedError(),
      ErrorCode.OAUTH_IDENTITY_ALREADY_LINKED,
    ],
  ])(
    'maps a confirm-link identity conflict to %s',
    async (conflict, expectedCode) => {
      const { service, createForUser, createSession, record } = createService();
      createForUser.mockRejectedValueOnce(conflict);

      await expect(
        service.confirmLink({
          email: 'user@example.com',
          otp: '123456',
          clientType: 'WEB',
        }),
      ).rejects.toEqual(
        expect.objectContaining({
          code: expectedCode,
          httpStatus: 409,
        }),
      );

      expect(record).not.toHaveBeenCalled();
      expect(createSession).not.toHaveBeenCalled();
    },
  );

  it.each([
    [new OAuthProviderAlreadyLinkedError(), ErrorCode.PROVIDER_ALREADY_LINKED],
    [
      new OAuthIdentityAlreadyLinkedError(),
      ErrorCode.OAUTH_IDENTITY_ALREADY_LINKED,
    ],
  ])(
    'maps an explicit-link identity conflict to %s',
    async (conflict, expectedCode) => {
      const { service, createForUser, record } = createService();
      createForUser.mockRejectedValueOnce(conflict);

      await expect(
        service.completeExplicitLink(
          {
            linkingUserId: 'user-id',
            linkingSessionId: 'session-id',
            provider: 'GOOGLE',
          } as never,
          { providerSubject: 'google-subject' } as never,
        ),
      ).rejects.toEqual(
        expect.objectContaining({
          code: expectedCode,
          httpStatus: 409,
        }),
      );

      expect(record).not.toHaveBeenCalled();
    },
  );
});
