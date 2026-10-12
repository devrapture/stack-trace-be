import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import * as client from 'openid-client';
import { AppError } from '../common/error/app-error.js';
import { ErrorCode } from '../common/error/error-codes.js';
import { APP_CONFIG, type AppConfig } from '../config/app-config.js';
import {
  OAuthAuthorizationRequest,
  OAuthProviderAdapter,
  VerifiedOAuthProfile,
} from './oauth-provider.interface.js';

const GOOGLE_ISSUER = 'https://accounts.google.com';

@Injectable()
export class GoogleOauthProvider implements OAuthProviderAdapter {
  readonly provider = 'GOOGLE' as const;
  private configPromise: Promise<client.Configuration> | undefined;

  constructor(
    @Inject(APP_CONFIG)
    private readonly config: AppConfig,
  ) {}
  private async getConfig(): Promise<client.Configuration> {
    this.configPromise ??= client.discovery(
      new URL(GOOGLE_ISSUER),
      this.config.googleClientId,
      this.config.googleClientSecret,
    );
    return this.configPromise;
  }

  async createAuthorizationRequest(
    redirectUri: string,
  ): Promise<OAuthAuthorizationRequest> {
    const config = await this.getConfig();

    const pkceVerifier = client.randomPKCECodeVerifier();
    const codeChallenge = await client.calculatePKCECodeChallenge(pkceVerifier);
    const state = client.randomState();

    const nonce = client.randomNonce();

    const authorizationUrl = client
      .buildAuthorizationUrl(config, {
        redirect_uri: redirectUri,
        scope: 'openid email',
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
        state,
        nonce,
      })
      .toString();

    return { authorizationUrl, state, nonce, pkceVerifier };
  }

  async exchangeAndVerify(input: {
    callbackUrl: URL;
    expectedState: string;
    pkceVerifier?: string;
    nonce?: string;
  }): Promise<VerifiedOAuthProfile> {
    const config = await this.getConfig();

    const tokens = await client.authorizationCodeGrant(
      config,
      input.callbackUrl,
      {
        ...(input.pkceVerifier !== undefined
          ? { pkceCodeVerifier: input.pkceVerifier }
          : {}),
        ...(input.nonce !== undefined ? { expectedNonce: input.nonce } : {}),
      },
    );

    const claims = tokens.claims();

    if (!claims)
      throw new AppError(
        ErrorCode.OAUTH_PROVIDER_ERROR,
        'Google sign-in failed: no ID token claims were returned.',
        HttpStatus.BAD_GATEWAY,
      );

    if (!claims.email_verified || typeof claims.email !== 'string')
      throw new AppError(
        ErrorCode.EMAIL_NOT_VERIFIED,
        'Google did not report a verified email for this account. verify your email with Google and try again',
        HttpStatus.BAD_REQUEST,
      );

    return {
      providerSubject: String(claims.sub),
      email: claims.email,
    };
  }
}
