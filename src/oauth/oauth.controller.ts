import {
  Controller,
  Get,
  HttpStatus,
  Inject,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { type FastifyReply, type FastifyRequest } from 'fastify';
import { AppError } from '../common/error/app-error.js';
import { ErrorCode } from '../common/error/error-codes.js';
import {
  respondWithIssuedSession,
  SessionResponseBody,
} from '../auth/session-response.js';
import { APP_CONFIG, type AppConfig } from '../config/app-config.js';
import { StartOAuthDto } from './dto/start-oauth.dto.js';
import { OAuthLoginService } from './oauth-login.service.js';
import {
  clearOAuthStateCookie,
  oauthStateCookieName,
  oauthStateMatchesCookie,
  setOAuthStateCookie,
} from './oauth-state-binding.js';
import type { OAuthProviderName } from './oauth-state.repository.js';
import { Public } from '../sessions/public.decorator.js';

@Public()
@Controller('oauth')
export class OauthController {
  constructor(
    @Inject(APP_CONFIG)
    private readonly config: AppConfig,
    private readonly oauthLoginService: OAuthLoginService,
  ) {}

  @Get('google/start')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async googleStart(
    @Query() query: StartOAuthDto,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<{ authorizationUrl: string } | undefined> {
    return this.start('GOOGLE', query, reply);
  }

  @Get('google/callback')
  async googleCallback(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<SessionResponseBody> {
    return this.callback('GOOGLE', request, reply);
  }

  @Get('github/start')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async githubStart(
    @Query() query: StartOAuthDto,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<{ authorizationUrl: string } | undefined> {
    return this.start('GITHUB', query, reply);
  }

  @Get('github/callback')
  async githubCallback(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<SessionResponseBody> {
    return this.callback('GITHUB', request, reply);
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

  private async callback(
    provider: OAuthProviderName,
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<SessionResponseBody> {
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

    const session = await this.oauthLoginService.handleCallback(
      provider,
      callbackUrl,
    );

    return respondWithIssuedSession(session, reply, this.config);
  }
}
