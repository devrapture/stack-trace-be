import { Controller, Get, Inject, Query, Req, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { type FastifyReply, type FastifyRequest } from 'fastify';
import {
  respondWithIssuedSession,
  SessionResponseBody,
} from '../auth/session-response.js';
import { APP_CONFIG, type AppConfig } from '../config/app-config.js';
import { StartOAuthDto } from './dto/start-oauth.dto.js';
import { OAuthLoginService } from './oauth-login.service.js';
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
    provider: 'GOOGLE' | 'GITHUB',
    query: StartOAuthDto,
    reply: FastifyReply,
  ): Promise<{ authorizationUrl: string } | undefined> {
    const { authorizationUrl } = await this.oauthLoginService.start(
      provider,
      query.clientType,
    );
    if (query.clientType === 'WEB') {
      reply.redirect(authorizationUrl, 302);
      return undefined;
    }

    return { authorizationUrl };
  }

  private async callback(
    provider: 'GOOGLE' | 'GITHUB',
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<SessionResponseBody> {
    const callbackUrl = new URL(request.url, this.config.publicBaseUrl);
    const session = await this.oauthLoginService.handleCallback(
      provider,
      callbackUrl,
    );

    return respondWithIssuedSession(session, reply, this.config);
  }
}
