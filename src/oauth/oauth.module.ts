import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { PlatformConfigModule } from '../config/platform-config.module.js';
import { EmailModule } from '../email/email.module.js';
import { SessionsModule } from '../sessions/sessions.module.js';
import { UsersModule } from '../users/users.module.js';
import { GithubOauthProvider } from './github-oauth.provider.js';
import { GoogleOauthProvider } from './google-oauth.provider.js';
import { OAUTH_IDENTITIES_REPOSITORY } from './oauth-identities.repository.js';
import { OAUTH_LINK_CHALLENGE_REPOSITORY } from './oauth-link-challenge.repository.js';
import { OAuthLinkChallengeCleanupService } from './oauth-link-challenge-cleanup.service.js';
import { OAuthLoginService } from './oauth-login.service.js';
import { OAuthProviderRegistry } from './oauth-provider-registry.service.js';
import { OAuthStateCleanupService } from './oauth-state-cleanup.service.js';
import { OAUTH_STATE_REPOSITORY } from './oauth-state.repository.js';
import { OauthController } from './oauth.controller.js';
import { PrismaOAuthIdentitiesRepository } from './prisma-oauth-identities.repository.js';
import { PrismaOAuthLinkChallengeRepository } from './prisma-oauth-link-challenge.repository.js';
import { PrismaOAuthStateRepository } from './prisma-oauth-state.repository.js';
import { IdentityLinkingService } from './identity-linking.service.js';

@Module({
  imports: [
    PlatformConfigModule,
    UsersModule,
    SessionsModule,
    AuthModule,
    AuditModule,
    EmailModule,
  ],
  controllers: [OauthController],
  providers: [
    GoogleOauthProvider,
    GithubOauthProvider,
    OAuthLoginService,
    OAuthStateCleanupService,
    OAuthLinkChallengeCleanupService,
    OAuthProviderRegistry,
    IdentityLinkingService,
    {
      provide: OAUTH_STATE_REPOSITORY,
      useClass: PrismaOAuthStateRepository,
    },
    {
      provide: OAUTH_IDENTITIES_REPOSITORY,
      useClass: PrismaOAuthIdentitiesRepository,
    },
    {
      provide: OAUTH_LINK_CHALLENGE_REPOSITORY,
      useClass: PrismaOAuthLinkChallengeRepository,
    },
  ],
})
export class OauthModule {}
