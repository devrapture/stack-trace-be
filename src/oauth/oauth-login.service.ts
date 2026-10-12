import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { AppError } from '../common/error/app-error.js';
import { ErrorCode } from '../common/error/error-codes.js';
import { APP_CONFIG, type AppConfig } from '../config/app-config.js';
import { UNIT_OF_WORK, type UnitOfWork } from '../prisma/unit-of-work.js';
import type { SessionClientTypeName } from '../sessions/session-client-type.js';
import { IssuedSession, SessionService } from '../sessions/session.service.js';
import { normalizeEmail } from '../users/normalize-email.js';
import {
  USERS_REPOSITORY,
  type UsersRepository,
} from '../users/users.repository.js';
import { GithubOauthProvider } from './github-oauth.provider.js';
import { GoogleOauthProvider } from './google-oauth.provider.js';
import {
  OAUTH_IDENTITIES_REPOSITORY,
  type OAuthIdentitiesRepository,
} from './oauth-identities.repository.js';
import {
  OAuthProviderAdapter,
  VerifiedOAuthProfile,
} from './oauth-provider.interface.js';
import {
  OAUTH_STATE_REPOSITORY,
  OAuthProviderName,
  type OAuthStateRepository,
} from './oauth-state.repository.js';

const OAUTH_STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes — this flow should complete in one browser round-trip

@Injectable()
export class OAuthLoginService {
  constructor(
    @Inject(APP_CONFIG)
    private readonly config: AppConfig,
    @Inject(OAUTH_STATE_REPOSITORY)
    private readonly stateRepository: OAuthStateRepository,
    @Inject(OAUTH_IDENTITIES_REPOSITORY)
    private readonly identityRepository: OAuthIdentitiesRepository,
    @Inject(UNIT_OF_WORK)
    private readonly unitOfWork: UnitOfWork,
    @Inject(USERS_REPOSITORY)
    private readonly userRepository: UsersRepository,
    private readonly sessionService: SessionService,
    private readonly googleProvider: GoogleOauthProvider,
    private readonly githubProvider: GithubOauthProvider,
  ) {}
  async start(
    provider: OAuthProviderName,
    clientType: SessionClientTypeName,
  ): Promise<{ authorizationUrl: string; state: string }> {
    const adapter = this.adapterFor(provider);
    const redirectUri = this.redirectUriFor(provider);
    const request = await adapter.createAuthorizationRequest(redirectUri);
    await this.stateRepository.create({
      provider,
      intent: 'LOGIN',
      state: request.state,
      ...(request.nonce ? { nonce: request.nonce } : {}),
      ...(request.pkceVerifier ? { pkceVerifier: request.pkceVerifier } : {}),
      redirectUri,
      clientType,
      expiresAt: new Date(Date.now() + OAUTH_STATE_TTL_MS),
    });

    return {
      authorizationUrl: request.authorizationUrl,
      state: request.state,
    };
  }

  async handleCallback(
    provider: OAuthProviderName,
    callbackUrl: URL,
  ): Promise<IssuedSession> {
    const stateParam = callbackUrl.searchParams.get('state');
    if (!stateParam)
      throw new AppError(
        ErrorCode.OAUTH_STATE_INVALID,
        'This sign-in attempt is invalid or has expired.Please try again',
        HttpStatus.BAD_REQUEST,
      );

    const stateRecord = await this.stateRepository.consume(stateParam);

    if (
      !stateRecord ||
      stateRecord.provider !== provider ||
      stateRecord.expiresAt.getTime() <= Date.now()
    )
      throw new AppError(
        ErrorCode.OAUTH_STATE_INVALID,
        'This sign-in attempt is invalid or has expired.Please try again',
        HttpStatus.BAD_REQUEST,
      );

    const providerCallbackUrl = new URL(stateRecord.redirectUri);
    providerCallbackUrl.search = callbackUrl.search;

    const adapter = this.adapterFor(provider);
    const profile = await adapter.exchangeAndVerify({
      callbackUrl: providerCallbackUrl,
      expectedState: stateParam,
      ...(stateRecord.pkceVerifier !== null
        ? { pkceVerifier: stateRecord.pkceVerifier }
        : {}),
      ...(stateRecord.nonce !== null ? { nonce: stateRecord.nonce } : {}),
    });

    const user = await this.resolveOrCreateUser(provider, profile);
    return this.sessionService.createSession(user.id, {
      clientType: stateRecord.clientType,
    });
  }

  private adapterFor(provider: OAuthProviderName): OAuthProviderAdapter {
    return provider === 'GOOGLE' ? this.googleProvider : this.githubProvider;
  }

  private redirectUriFor(provider: OAuthProviderName): string {
    const base = this.config.publicBaseUrl.replace(/\/+$/, '');
    return `${base}/api/v1/oauth/${provider.toLowerCase()}/callback`;
  }

  private async resolveOrCreateUser(
    provider: OAuthProviderName,
    profile: VerifiedOAuthProfile,
  ) {
    const existingUser =
      await this.identityRepository.findUserIdByProviderSubject(
        provider,
        profile.providerSubject,
      );

    if (existingUser) {
      const user = await this.userRepository.getUserById(existingUser);
      if (!user)
        throw new Error(
          `AuthIdentity for ${provider}:${profile.providerSubject} references a missing user.`,
        );

      return user;
    }

    const { normalizedEmail } = normalizeEmail(profile.email);
    const existingUserByEmail =
      await this.userRepository.getUserByNormalizedEmail(normalizedEmail);
    if (existingUserByEmail) {
      // A DIFFERENT identity already owns this email (a password account,  or a different OAuth provider)
      throw new AppError(
        ErrorCode.ACCOUNT_LINK_REQUIRED,
        'Additional verification is required to link to this sign-in method',
        HttpStatus.CONFLICT,
      );
    }

    return this.unitOfWork.run(async (tx) => {
      const newUser = await this.userRepository.createWithPrimaryEmail(
        {
          email: profile.email,
        },
        tx,
      );

      await this.identityRepository.createForUser(
        newUser.id,
        provider,
        profile.providerSubject,
        tx,
      );

      return newUser;
    });
  }
}
