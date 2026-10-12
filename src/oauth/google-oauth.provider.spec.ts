import * as client from 'openid-client';
import { vi } from 'vitest';
import type { AppConfig } from '../config/app-config.js';
import { GoogleOauthProvider } from './google-oauth.provider.js';

vi.mock('openid-client', () => ({
  authorizationCodeGrant: vi.fn(),
  discovery: vi.fn(),
}));

describe('GoogleOauthProvider', () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  it('passes the stored state to authorization response validation', async () => {
    const configuration = {} as client.Configuration;
    vi.mocked(client.discovery).mockResolvedValue(configuration);
    vi.mocked(client.authorizationCodeGrant).mockResolvedValue({
      claims: () => ({
        sub: 'google-user-id',
        email: 'user@example.com',
        email_verified: true,
      }),
    } as never);
    const provider = new GoogleOauthProvider({
      googleClientId: 'google-client-id',
      googleClientSecret: 'google-client-secret',
    } as AppConfig);
    const callbackUrl = new URL(
      'http://localhost:3000/api/v1/oauth/google/callback?state=stored-state&code=code',
    );

    await provider.exchangeAndVerify({
      callbackUrl,
      expectedState: 'stored-state',
      pkceVerifier: 'pkce-verifier',
      nonce: 'nonce',
    });

    expect(client.authorizationCodeGrant).toHaveBeenCalledWith(
      configuration,
      callbackUrl,
      {
        expectedState: 'stored-state',
        pkceCodeVerifier: 'pkce-verifier',
        expectedNonce: 'nonce',
      },
    );
  });
});
