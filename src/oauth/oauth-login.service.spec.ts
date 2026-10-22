import { vi } from 'vitest';
import type { OtpService } from '../auth/email-verification/otp.service.js';
import type { AppConfig } from '../config/app-config.js';
import type { EmailProvider } from '../email/email-provider.js';
import type { UnitOfWork } from '../prisma/unit-of-work.js';
import type { SessionService } from '../sessions/session.service.js';
import type { UsersRepository } from '../users/users.repository.js';
import type { GithubOauthProvider } from './github-oauth.provider.js';
import type { GoogleOauthProvider } from './google-oauth.provider.js';
import type { IdentityLinkingService } from './identity-linking.service.js';
import type { OAuthIdentitiesRepository } from './oauth-identities.repository.js';
import type { OAuthLinkChallengeRepository } from './oauth-link-challenge.repository.js';
import { OAuthLoginService } from './oauth-login.service.js';
import type { OAuthStateRepository } from './oauth-state.repository.js';

const createService = (overrides?: {
  publicBaseUrl?: string;
  stateRepository?: Partial<OAuthStateRepository>;
  identityRepository?: Partial<OAuthIdentitiesRepository>;
  userRepository?: Partial<UsersRepository>;
  emailProvider?: Partial<EmailProvider>;
  oauthLinkChallengeRepository?: Partial<OAuthLinkChallengeRepository>;
  sessionService?: Partial<SessionService>;
  googleProvider?: Partial<GoogleOauthProvider>;
  otpService?: Partial<OtpService>;
}) =>
  new OAuthLoginService(
    {
      publicBaseUrl: overrides?.publicBaseUrl ?? 'https://api.example.com',
    } as AppConfig,
    overrides?.stateRepository as OAuthStateRepository,
    overrides?.identityRepository as OAuthIdentitiesRepository,
    {} as UnitOfWork,
    overrides?.userRepository as UsersRepository,
    overrides?.emailProvider as EmailProvider,
    overrides?.oauthLinkChallengeRepository as OAuthLinkChallengeRepository,
    overrides?.sessionService as SessionService,
    overrides?.googleProvider as GoogleOauthProvider,
    {} as GithubOauthProvider,
    {} as IdentityLinkingService,
    overrides?.otpService as OtpService,
  );

describe('OAuthLoginService callback redirect URI', () => {
  it('removes trailing slashes from the public base URL', async () => {
    const create = vi.fn().mockResolvedValue(undefined);
    const createAuthorizationRequest = vi.fn().mockResolvedValue({
      authorizationUrl: 'https://accounts.google.com/authorize',
      state: 'oauth-state',
    });
    const service = createService({
      publicBaseUrl: 'https://api.example.com///',
      stateRepository: { create },
      googleProvider: { createAuthorizationRequest },
    });

    await service.start('GOOGLE', 'WEB');

    const redirectUri = 'https://api.example.com/api/v1/oauth/google/callback';
    expect(createAuthorizationRequest).toHaveBeenCalledWith(redirectUri);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ redirectUri }),
    );
  });

  it('uses the stored redirect URI with the incoming callback query', async () => {
    const redirectUri =
      'https://public.example.com/api/v1/oauth/google/callback';
    const consume = vi.fn().mockResolvedValue({
      id: 'oauth-state-id',
      provider: 'GOOGLE',
      intent: 'LOGIN',
      nonce: 'nonce',
      pkceVerifier: 'pkce-verifier',
      redirectUri,
      clientType: 'WEB',
      linkingUserId: null,
      expiresAt: new Date(Date.now() + 60_000),
      consumedAt: new Date(),
    });
    const exchangeAndVerify = vi.fn().mockResolvedValue({
      providerSubject: 'google-subject',
      email: 'user@example.com',
    });
    const findUserIdByProviderSubject = vi.fn().mockResolvedValue('user-id');
    const getUserById = vi.fn().mockResolvedValue({ id: 'user-id' });
    const issuedSession = {
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      sessionId: 'session-id',
      refreshTokenExpiresAt: new Date(Date.now() + 60_000),
      clientType: 'WEB' as const,
    };
    const createSession = vi.fn().mockResolvedValue(issuedSession);
    const service = createService({
      stateRepository: { consume },
      identityRepository: { findUserIdByProviderSubject },
      userRepository: { getUserById },
      sessionService: { createSession },
      googleProvider: { exchangeAndVerify },
    });

    const result = await service.handleCallback(
      'GOOGLE',
      new URL(
        'http://internal:3000/untrusted/path?state=oauth-state&code=oauth-code&scope=email',
      ),
    );

    expect(result).toEqual({ kind: 'session', session: issuedSession });
    const exchangeInput = exchangeAndVerify.mock.calls[0]?.[0] as {
      callbackUrl: URL;
    };
    expect(exchangeInput.callbackUrl.toString()).toBe(
      `${redirectUri}?state=oauth-state&code=oauth-code&scope=email`,
    );
  });

  it('returns a link-required result after sending an OTP for an existing email', async () => {
    const consume = vi.fn().mockResolvedValue({
      id: 'oauth-state-id',
      provider: 'GOOGLE',
      intent: 'LOGIN',
      nonce: null,
      pkceVerifier: null,
      redirectUri: 'https://api.example.com/api/v1/oauth/google/callback',
      clientType: 'WEB',
      linkingUserId: null,
      expiresAt: new Date(Date.now() + 60_000),
      consumedAt: new Date(),
    });
    const exchangeAndVerify = vi.fn().mockResolvedValue({
      providerSubject: 'google-subject',
      email: 'user@example.com',
    });
    const createChallenge = vi.fn().mockResolvedValue(undefined);
    const send = vi.fn().mockResolvedValue(undefined);
    const service = createService({
      stateRepository: { consume },
      identityRepository: {
        findUserIdByProviderSubject: vi.fn().mockResolvedValue(null),
      },
      userRepository: {
        getUserByNormalizedEmail: vi.fn().mockResolvedValue({
          id: 'existing-user-id',
          primaryEmail: { display: 'user@example.com' },
        }),
      },
      emailProvider: { send },
      oauthLinkChallengeRepository: { create: createChallenge },
      googleProvider: { exchangeAndVerify },
      otpService: {
        generate: vi.fn().mockReturnValue('123456'),
        hash: vi.fn().mockReturnValue('otp-hash'),
      },
    });

    await expect(
      service.handleCallback(
        'GOOGLE',
        new URL(
          'https://api.example.com/api/v1/oauth/google/callback?state=oauth-state&code=oauth-code',
        ),
      ),
    ).resolves.toEqual({ kind: 'link_required', provider: 'GOOGLE' });

    expect(createChallenge).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'existing-user-id',
        provider: 'GOOGLE',
        providerSubject: 'google-subject',
        otpHash: 'otp-hash',
      }),
    );
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'user@example.com' }),
    );
  });
});
