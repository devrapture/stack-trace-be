import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { Octokit } from 'octokit';
import * as client from 'openid-client';
import { AppError } from '../common/error/app-error.js';
import { ErrorCode } from '../common/error/error-codes.js';
import { APP_CONFIG, type AppConfig } from '../config/app-config.js';
import {
  OAuthAuthorizationRequest,
  OAuthProviderAdapter,
  VerifiedOAuthProfile,
} from './oauth-provider.interface.js';

interface GitHubAccessTokenResponse {
  access_token?: string;
  error?: string;
  error_description?: string;
}

@Injectable()
export class GithubOauthProvider implements OAuthProviderAdapter {
  readonly provider = 'GITHUB' as const;

  constructor(
    @Inject(APP_CONFIG)
    private readonly config: AppConfig,
  ) {}

  private getCredentials(): { clientId: string; clientSecret: string } {
    const clientId = this.config.githubClientId;
    const clientSecret = this.config.githubClientSecret;

    return {
      clientId,
      clientSecret,
    };
  }

  async createAuthorizationRequest(
    redirectUri: string,
  ): Promise<OAuthAuthorizationRequest> {
    const { clientId } = this.getCredentials();
    const state = client.randomState();
    const url = new URL('https://github.com/login/oauth/authorize');
    url.searchParams.set('client_id', clientId);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('scope', 'read:user user:email');
    url.searchParams.set('state', state);

    return { authorizationUrl: url.toString(), state };
  }

  async exchangeAndVerify(input: {
    callbackUrl: URL;
    expectedState: string;
    pkceVerifier?: string;
    nonce?: string;
  }): Promise<VerifiedOAuthProfile> {
    const { clientId, clientSecret } = this.getCredentials();
    const code = input.callbackUrl.searchParams.get('code');
    const returnedState = input.callbackUrl.searchParams.get('state');
    if (!code || !returnedState || returnedState !== input.expectedState)
      throw new AppError(
        ErrorCode.OAUTH_STATE_INVALID,
        'This sign-in attempt is invalid or has expired. Please try again.',
        HttpStatus.BAD_REQUEST,
      );

    const tokenResponse = await fetch(
      'https://github.com/login/oauth/access_token',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          client_id: clientId,
          client_secret: clientSecret,
          code,
          redirect_uri: `${input.callbackUrl.origin}${input.callbackUrl.pathname}`,
        }),
      },
    );

    const tokenBody = (await tokenResponse.json()) as GitHubAccessTokenResponse;
    if (!tokenBody.access_token)
      throw new AppError(
        ErrorCode.OAUTH_PROVIDER_ERROR,
        `Github sign-in failed:${tokenBody.error_description ?? tokenBody.error ?? 'token exchange failed'}`,
        HttpStatus.BAD_GATEWAY,
      );
    const octokit = new Octokit({ auth: tokenBody.access_token });

    const { data: profile } = await octokit.rest.users.getAuthenticated();
    const { data: emails } =
      await octokit.rest.users.listEmailsForAuthenticatedUser();
    const verified = emails.filter((e) => e.verified);
    const chosen = verified.find((e) => e.primary) ?? verified[0];

    if (!chosen)
      throw new AppError(
        ErrorCode.GITHUB_EMAIL_UNAVAILABLE,
        'Your GitHub account has no verified email address. Verify an email on GitHub and try again.',
        HttpStatus.BAD_REQUEST,
      );

    return {
      providerSubject: String(profile.id),
      email: chosen.email,
    };
  }
}
