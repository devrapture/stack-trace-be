import { Inject, Injectable } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../config/app-config.js';
import { GithubOauthProvider } from './github-oauth.provider.js';
import { GoogleOauthProvider } from './google-oauth.provider.js';
import { OAuthProviderAdapter } from './oauth-provider.interface.js';
import { OAuthProviderName } from './oauth-state.repository.js';

@Injectable()
export class OAuthProviderRegistry {
  constructor(
    private readonly googleProvider: GoogleOauthProvider,
    private readonly githubProvider: GithubOauthProvider,
    @Inject(APP_CONFIG)
    private readonly config: AppConfig,
  ) {}

  adapterFor(providerName: OAuthProviderName): OAuthProviderAdapter {
    return providerName === 'GITHUB'
      ? this.githubProvider
      : this.googleProvider;
  }

  redirectUriFor(provider: OAuthProviderName): string {
    const base = this.config.publicBaseUrl.replace(/\/+$/, '');
    return `${base}/api/v1/oauth/${provider.toLowerCase()}/callback`;
  }
}
