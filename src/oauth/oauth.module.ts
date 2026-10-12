import { Module } from '@nestjs/common';
import { PlatformConfigModule } from '../config/platform-config.module.js';
import { SessionsModule } from '../sessions/sessions.module.js';
import { UsersModule } from '../users/users.module.js';
import { GithubOauthProvider } from './github-oauth.provider.js';
import { GoogleOauthProvider } from './google-oauth.provider.js';
import { OAUTH_IDENTITIES_REPOSITORY } from './oauth-identities.repository.js';
import { OAUTH_STATE_REPOSITORY } from './oauth-state.repository.js';
import { OauthController } from './oauth.controller.js';
import { PrismaOAuthIdentitiesRepository } from './prisma-oauth-identities.repository.js';
import { PrismaOAuthStateRepository } from './prisma-oauth-state.repository.js';
import { OAuthLoginService } from './oauth-login.service.js';

@Module({
  imports: [PlatformConfigModule, UsersModule, SessionsModule],
  controllers: [OauthController],
  providers: [
    GoogleOauthProvider,
    GithubOauthProvider,
    OAuthLoginService,
    {
      provide: OAUTH_STATE_REPOSITORY,
      useClass: PrismaOAuthStateRepository,
    },
    {
      provide: OAUTH_IDENTITIES_REPOSITORY,
      useClass: PrismaOAuthIdentitiesRepository,
    },
  ],
})
export class OauthModule {}
