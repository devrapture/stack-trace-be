import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import {
  OTP_MAX_ATTEMPTS,
  OTP_TTL_MS,
  OtpService,
} from '../auth/email-verification/otp.service.js';
import { AppError } from '../common/error/app-error.js';
import { ErrorCode } from '../common/error/error-codes.js';
import { APP_CONFIG, type AppConfig } from '../config/app-config.js';
import { EMAIL_PROVIDER, type EmailProvider } from '../email/email-provider.js';
import { accountEmail } from '../email/templates/account-email.js';
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
import { IdentityLinkingService } from './identity-linking.service.js';
import {
  OAUTH_IDENTITIES_REPOSITORY,
  type OAuthIdentitiesRepository,
} from './oauth-identities.repository.js';
import {
  OAUTH_LINK_CHALLENGE_REPOSITORY,
  type OAuthLinkChallengeRepository,
} from './oauth-link-challenge.repository.js';
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

export type OAuthCallbackResult =
  | { kind: 'session'; session: IssuedSession }
  | { kind: 'linked'; provider: OAuthProviderName }
  | { kind: 'link_required'; provider: OAuthProviderName };

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
    @Inject(EMAIL_PROVIDER)
    private readonly emailProvider: EmailProvider,
    @Inject(OAUTH_LINK_CHALLENGE_REPOSITORY)
    private readonly oauthLinkChallengeRepository: OAuthLinkChallengeRepository,
    private readonly sessionService: SessionService,
    private readonly googleProvider: GoogleOauthProvider,
    private readonly githubProvider: GithubOauthProvider,
    private readonly identityLinkingService: IdentityLinkingService,
    private readonly otpService: OtpService,
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
  ): Promise<OAuthCallbackResult> {
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

    if (stateRecord.intent === 'LINK') {
      await this.identityLinkingService.completeExplicitLink(
        stateRecord,
        profile,
      );
      return { kind: 'linked', provider };
    }

    const user = await this.resolveOrCreateUser(provider, profile);
    if (!user) return { kind: 'link_required', provider };

    const session = await this.sessionService.createSession(user.id, {
      clientType: stateRecord.clientType,
    });

    return { kind: 'session', session };
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
      if (existingUserByEmail.status !== 'ACTIVE') {
        throw new AppError(
          ErrorCode.ACCOUNT_LINK_REQUIRED,
          'Additional verification is required to link to this sign-in method',
          HttpStatus.CONFLICT,
        );
      }

      // A DIFFERENT identity already owns this email (a password account,  or a different OAuth provider)
      await this.issueLinkChallenge(
        existingUserByEmail.id,
        provider,
        profile,
        existingUserByEmail.primaryEmail?.display ?? profile.email,
      );
      return null;
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

  private async issueLinkChallenge(
    existingUserId: string,
    provider: OAuthProviderName,
    profile: VerifiedOAuthProfile,
    existingUserEmail: string,
  ): Promise<void> {
    const otp = this.otpService.generate();
    const otpHash = this.otpService.hash(otp);

    await this.oauthLinkChallengeRepository.create({
      userId: existingUserId,
      provider,
      providerSubject: profile.providerSubject,
      otpHash,
      expiresAt: new Date(Date.now() + OTP_TTL_MS),
      maxAttempts: OTP_MAX_ATTEMPTS,
    });

    await this.emailProvider.send({
      to: existingUserEmail,
      ...accountEmail({
        type: 'oauth_link_challenge_otp',
        provider,
        otp,
        expiresInMinutes: OTP_TTL_MS / 60_000,
      }),
    });
  }
}
