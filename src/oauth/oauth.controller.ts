import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { type FastifyReply, type FastifyRequest } from 'fastify';
import { CsrfGuard } from '../auth/csrf.guard.js';
import {
  respondWithIssuedSession,
  SessionResponseBody,
} from '../auth/session-response.js';
import { AppError } from '../common/error/app-error.js';
import { ErrorCode } from '../common/error/error-codes.js';
import { APP_CONFIG, type AppConfig } from '../config/app-config.js';
import { CurrentUser } from '../sessions/current-user.decorator.js';
import { type RequestUser } from '../sessions/jwt.strategy.js';
import { Public } from '../sessions/public.decorator.js';
import { ConfirmLinkDto } from './dto/confirm-link.dto.js';
import { LinkedMethodDto } from './dto/linked-method.dto.js';
import { StartOAuthDto } from './dto/start-oauth.dto.js';
import { IdentityLinkingService } from './identity-linking.service.js';
import { OAuthLoginService } from './oauth-login.service.js';
import {
  clearOAuthStateCookie,
  oauthStateCookieName,
  oauthStateMatchesCookie,
  setOAuthStateCookie,
} from './oauth-state-binding.js';
import type { OAuthProviderName } from './oauth-state.repository.js';

@Controller('oauth')
export class OauthController {
  constructor(
    @Inject(APP_CONFIG)
    private readonly config: AppConfig,
    private readonly oauthLoginService: OAuthLoginService,
    private readonly identityLinkingService: IdentityLinkingService,
  ) {}

  @Public()
  @Get('google/start')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async googleStart(
    @Query() query: StartOAuthDto,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<{ authorizationUrl: string } | undefined> {
    return this.start('GOOGLE', query, reply);
  }

  @Public()
  @Get('google/callback')
  async googleCallback(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    return this.callback('GOOGLE', request, reply);
  }

  @Public()
  @Get('github/start')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async githubStart(
    @Query() query: StartOAuthDto,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<{ authorizationUrl: string } | undefined> {
    return this.start('GITHUB', query, reply);
  }

  @Public()
  @Get('github/callback')
  async githubCallback(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    return this.callback('GITHUB', request, reply);
  }

  @Public()
  @Post('confirm-link')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async confirmLink(
    @Body() dto: ConfirmLinkDto,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<SessionResponseBody> {
    const session = await this.identityLinkingService.confirmLink(dto);
    return respondWithIssuedSession(session, reply, this.config);
  }

  @Get('linked')
  async listLinked(
    @CurrentUser() currentUser: RequestUser,
  ): Promise<LinkedMethodDto[]> {
    return this.identityLinkingService.listLinkedMethods(currentUser.userId);
  }

  @Get('google/link/start')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async googleLinkStart(
    @CurrentUser() currentUser: RequestUser,
    @Query() query: StartOAuthDto,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    return this.startLink(
      currentUser.userId,
      'GOOGLE',
      query.clientType,
      reply,
    );
  }

  @Get('github/link/start')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async githubLinkStart(
    @CurrentUser() currentUser: RequestUser,
    @Query() query: StartOAuthDto,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    return this.startLink(
      currentUser.userId,
      'GITHUB',
      query.clientType,
      reply,
    );
  }

  @Delete(':provider')
  @HttpCode(204)
  @UseGuards(CsrfGuard)
  async unlink(
    @CurrentUser() currentUser: RequestUser,
    @Param('provider') provider: string,
  ): Promise<void> {
    await this.identityLinkingService.unlinkProvider(
      currentUser.userId,
      provider.toUpperCase() as OAuthProviderName,
    );
  }

  private async start(
    provider: OAuthProviderName,
    query: StartOAuthDto,
    reply: FastifyReply,
  ): Promise<{ authorizationUrl: string } | undefined> {
    if (query.clientType !== 'WEB')
      throw new AppError(
        ErrorCode.BAD_REQUEST,
        'OAuth login currently supports WEB clients only.',
        HttpStatus.BAD_REQUEST,
      );

    const { authorizationUrl, state } = await this.oauthLoginService.start(
      provider,
      query.clientType,
    );
    setOAuthStateCookie(
      reply,
      provider,
      state,
      this.config.environment === 'production',
    );
    reply.redirect(authorizationUrl, 302);

    return undefined;
  }

  private async startLink(
    userId: string,
    provider: OAuthProviderName,
    clientType: StartOAuthDto['clientType'],
    reply: FastifyReply,
  ): Promise<{ authorizationUrl: string }> {
    const { authorizationUrl, state } =
      await this.identityLinkingService.startExplicitLink(
        userId,
        provider,
        clientType,
      );
    setOAuthStateCookie(
      reply,
      provider,
      state,
      this.config.environment === 'production',
    );

    return { authorizationUrl };
  }

  private async callback(
    provider: OAuthProviderName,
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<
    | SessionResponseBody
    | { linked: true; provider: OAuthProviderName }
    | {
        verificationRequired: true;
        code: typeof ErrorCode.ACCOUNT_LINK_REQUIRED;
        provider: OAuthProviderName;
        message: string;
      }
  > {
    const callbackUrl = new URL(request.url, this.config.publicBaseUrl);
    const state = callbackUrl.searchParams.get('state');
    const stateCookie = request.cookies?.[oauthStateCookieName(provider)];

    if (!state || !oauthStateMatchesCookie(state, stateCookie))
      throw new AppError(
        ErrorCode.OAUTH_STATE_INVALID,
        'This sign-in attempt is invalid or has expired. Please try again.',
        HttpStatus.BAD_REQUEST,
      );

    clearOAuthStateCookie(reply, provider);

    const result = await this.oauthLoginService.handleCallback(
      provider,
      callbackUrl,
    );

    if (result.kind === 'link_required') {
      return {
        verificationRequired: true,
        code: ErrorCode.ACCOUNT_LINK_REQUIRED,
        provider: result.provider,
        message:
          'A one-time verification code has been sent to your email address.',
      };
    }

    if (result.kind === 'linked') {
      return { linked: true, provider: result.provider };
    }

    return respondWithIssuedSession(result.session, reply, this.config);
  }
}
