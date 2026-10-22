import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import {
  AUDIT_LOG_REPOSITORY,
  type AuditLogRepository,
} from '../audit/audit-log.repository.js';
import { OtpService } from '../auth/email-verification/otp.service.js';
import {
  PASSWORD_CREDENTIALS_REPOSITORY,
  type PasswordCredentialsRepository,
} from '../auth/password/password-credentials.repository.js';
import { AppError } from '../common/error/app-error.js';
import { ErrorCode } from '../common/error/error-codes.js';
import { EMAIL_PROVIDER, type EmailProvider } from '../email/email-provider.js';
import { accountEmail } from '../email/templates/account-email.js';
import { UNIT_OF_WORK, type UnitOfWork } from '../prisma/unit-of-work.js';
import { SessionClientTypeName } from '../sessions/session-client-type.js';
import { IssuedSession, SessionService } from '../sessions/session.service.js';
import { normalizeEmail } from '../users/normalize-email.js';
import {
  USERS_REPOSITORY,
  type UsersRepository,
} from '../users/users.repository.js';
import { ConfirmLinkDto } from './dto/confirm-link.dto.js';
import { LinkedMethodDto } from './dto/linked-method.dto.js';
import {
  OAUTH_IDENTITIES_REPOSITORY,
  type OAuthIdentitiesRepository,
} from './oauth-identities.repository.js';
import {
  OAUTH_LINK_CHALLENGE_REPOSITORY,
  type OAuthLinkChallengeRepository,
} from './oauth-link-challenge.repository.js';
import { OAuthProviderRegistry } from './oauth-provider-registry.service.js';
import { VerifiedOAuthProfile } from './oauth-provider.interface.js';
import {
  OAUTH_STATE_REPOSITORY,
  OAuthProviderName,
  OAuthStateRecord,
  type OAuthStateRepository,
} from './oauth-state.repository.js';

const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

@Injectable()
export class IdentityLinkingService {
  constructor(
    @Inject(PASSWORD_CREDENTIALS_REPOSITORY)
    private passwordCredentialsRepository: PasswordCredentialsRepository,
    @Inject(OAUTH_IDENTITIES_REPOSITORY)
    private readonly oauthIdentitiesRepository: OAuthIdentitiesRepository,
    @Inject(OAUTH_STATE_REPOSITORY)
    private readonly oauthStateRepository: OAuthStateRepository,
    @Inject(UNIT_OF_WORK)
    private readonly unitOfWork: UnitOfWork,
    @Inject(AUDIT_LOG_REPOSITORY)
    private readonly auditLogRepository: AuditLogRepository,
    @Inject(USERS_REPOSITORY)
    private readonly userRepository: UsersRepository,
    @Inject(EMAIL_PROVIDER)
    private readonly emailProvider: EmailProvider,
    @Inject(OAUTH_LINK_CHALLENGE_REPOSITORY)
    private readonly oauthLinkChallengeRepository: OAuthLinkChallengeRepository,
    private readonly otpService: OtpService,
    private readonly sessionService: SessionService,
    private readonly registry: OAuthProviderRegistry,
  ) {}

  async listLinkedMethods(userId: string): Promise<LinkedMethodDto[]> {
    const [passwordHash, oauthIdentities] = await Promise.all([
      this.passwordCredentialsRepository.findHashByUserId(userId),
      this.oauthIdentitiesRepository.listForUser(userId),
    ]);

    const methods: LinkedMethodDto[] = [];
    if (passwordHash)
      methods.push({
        provider: 'PASSWORD',
      });

    for (const identity of oauthIdentities) {
      methods.push({
        provider: identity.provider,
        linkedAt: identity.createdAt.toISOString(),
      });
    }
    return methods;
  }

  async startExplicitLink(
    userId: string,
    provider: OAuthProviderName,
    clientType: SessionClientTypeName,
  ): Promise<{ authorizationUrl: string; state: string }> {
    const alreadyLinked = (
      await this.oauthIdentitiesRepository.listForUser(userId)
    ).some((identity) => identity.provider === provider);

    if (alreadyLinked)
      throw new AppError(
        ErrorCode.PROVIDER_ALREADY_LINKED,
        `This account has a ${provider} sign-in method linked.`,
        HttpStatus.CONFLICT,
      );

    const adapter = this.registry.adapterFor(provider);
    const redirectUri = this.registry.redirectUriFor(provider);
    const request = await adapter.createAuthorizationRequest(redirectUri);

    await this.oauthStateRepository.create({
      intent: 'LINK',
      provider,
      state: request.state,
      ...(request.nonce !== undefined ? { nonce: request.nonce } : {}),
      ...(request.pkceVerifier !== undefined
        ? { pkceVerifier: request.pkceVerifier }
        : {}),
      redirectUri,
      clientType,
      linkingUserId: userId,
      expiresAt: new Date(Date.now() + OAUTH_STATE_TTL_MS),
    });

    return {
      authorizationUrl: request.authorizationUrl,
      state: request.state,
    };
  }

  async completeExplicitLink(
    stateRecord: OAuthStateRecord,
    profile: VerifiedOAuthProfile,
  ): Promise<void> {
    if (!stateRecord.linkingUserId) {
      throw new Error(
        'completeExplicitLink called with a state record that has no linkingUserId.',
      );
    }
    await this.attachIdentity(
      stateRecord.linkingUserId,
      stateRecord.provider,
      profile.providerSubject,
    );
  }

  async confirmLink(dto: ConfirmLinkDto): Promise<IssuedSession> {
    const { normalizedEmail } = normalizeEmail(dto.email);
    const user =
      await this.userRepository.getUserByNormalizedEmail(normalizedEmail);

    if (!user)
      throw new AppError(
        ErrorCode.OTP_VERIFICATION_FAILED,
        'That code is invalid or has expired. Request a new one.',
        HttpStatus.BAD_REQUEST,
      );

    const challenge = await this.oauthLinkChallengeRepository.findActiveForUser(
      user.id,
    );

    if (!challenge)
      throw new AppError(
        ErrorCode.OTP_VERIFICATION_FAILED,
        'That code is invalid or has expired. Request a new one.',
        HttpStatus.BAD_REQUEST,
      );

    if (challenge.attemptCount >= challenge.maxAttempts)
      throw new AppError(
        ErrorCode.OTP_TOO_MANY_ATTEMPTS,
        'Too many incorrect attempts. Request a new code.',
        HttpStatus.TOO_MANY_REQUESTS,
      );

    if (challenge.expiresAt.getTime() <= Date.now())
      throw new AppError(
        ErrorCode.OTP_VERIFICATION_FAILED,
        'That code is invalid or has expired. Request a new one.',
        HttpStatus.BAD_REQUEST,
      );

    const isCorrect = this.otpService.verify(dto.otp, challenge.otpHash);

    if (!isCorrect) {
      const incremented =
        await this.oauthLinkChallengeRepository.incrementAttempts(challenge.id);
      if (!incremented)
        throw new AppError(
          ErrorCode.OTP_VERIFICATION_FAILED,
          'That code is invalid or has expired. Request a new one.',
          HttpStatus.BAD_REQUEST,
        );
      throw new AppError(
        ErrorCode.OTP_VERIFICATION_FAILED,
        'That code is invalid or has expired. Request a new one.',
        HttpStatus.BAD_REQUEST,
      );
    }

    await this.unitOfWork.run(async (tx) => {
      const consumed = await this.oauthLinkChallengeRepository.markConsumed(
        challenge.id,
        tx,
      );
      if (!consumed)
        throw new AppError(
          ErrorCode.OTP_VERIFICATION_FAILED,
          'That code is invalid or has expired. Request a new one.',
          HttpStatus.BAD_REQUEST,
        );

      await this.oauthIdentitiesRepository.createForUser(
        user.id,
        challenge.provider,
        challenge.providerSubject,
        tx,
      );

      await this.auditLogRepository.record(
        {
          userId: user.id,
          eventType: 'PROVIDER_LINKED',
          metadata: { provider: challenge.provider, via: 'email_challenge' },
        },
        tx,
      );
    });

    if (user?.primaryEmail)
      await this.emailProvider.send({
        to: user.primaryEmail.display,
        ...accountEmail({
          type: 'provider_linked',
          provider: challenge.provider,
        }),
      });

    return this.sessionService.createSession(user.id, {
      clientType: dto.clientType,
    });
  }

  async unlinkProvider(
    userId: string,
    provider: OAuthProviderName,
  ): Promise<void> {
    const [passwordHash, oauthIdentities] = await Promise.all([
      this.passwordCredentialsRepository.findHashByUserId(userId),
      this.oauthIdentitiesRepository.listForUser(userId),
    ]);

    const isLinked = oauthIdentities.some(
      (identity) => identity.provider === provider,
    );

    if (!isLinked)
      throw new AppError(
        ErrorCode.PROVIDER_NOT_LINKED,
        'This provider is not linked to your account',
        HttpStatus.NOT_FOUND,
      );

    const remainingOtherOAuth = oauthIdentities.filter(
      (i) => i.provider !== provider,
    ).length;
    const remainingTotal = (passwordHash ? 1 : 0) + remainingOtherOAuth;

    if (remainingTotal === 0)
      throw new AppError(
        ErrorCode.CANNOT_REMOVE_LAST_AUTH_METHOD,
        'You cannot remove your only remaining way to sign in.',
        HttpStatus.BAD_REQUEST,
      );

    await this.unitOfWork.run(async (tx) => {
      await this.oauthIdentitiesRepository.deleteForUser(userId, provider, tx);
      await this.auditLogRepository.record(
        {
          userId,
          eventType: 'PROVIDER_UNLINKED',
          metadata: {
            provider,
          },
        },
        tx,
      );
    });

    const user = await this.userRepository.getUserById(userId);

    if (user?.primaryEmail)
      await this.emailProvider.send({
        to: user.primaryEmail.display,
        ...accountEmail({
          type: 'provider_unlinked',
          provider,
        }),
      });
  }

  private async attachIdentity(
    userId: string,
    provider: OAuthProviderName,
    providerSubject: string,
  ): Promise<void> {
    const existingOwnerId =
      await this.oauthIdentitiesRepository.findUserIdByProviderSubject(
        provider,
        providerSubject,
      );

    if (existingOwnerId && existingOwnerId === userId) return;

    if (existingOwnerId)
      throw new AppError(
        ErrorCode.OAUTH_IDENTITY_ALREADY_LINKED,
        `This ${provider} account is already linked to a different Stack Trace account`,
        HttpStatus.CONFLICT,
      );

    const alreadyHasProvider = (
      await this.oauthIdentitiesRepository.listForUser(userId)
    ).some((identity) => identity.provider === provider);

    if (alreadyHasProvider)
      throw new AppError(
        ErrorCode.PROVIDER_ALREADY_LINKED,
        `This account already has a ${provider} sign-in method linked.`,
        HttpStatus.CONFLICT,
      );

    await this.unitOfWork.run(async (tx) => {
      await this.oauthIdentitiesRepository.createForUser(
        userId,
        provider,
        providerSubject,
        tx,
      );

      await this.auditLogRepository.record({
        userId,
        eventType: 'PROVIDER_LINKED',
        metadata: {
          provider,
          via: 'explicit_link',
        },
      });
    });

    const user = await this.userRepository.getUserById(userId);

    if (user?.primaryEmail)
      await this.emailProvider.send({
        to: user.primaryEmail.display,
        ...accountEmail({
          type: 'provider_linked',
          provider,
        }),
      });
  }
}
