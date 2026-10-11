import { FastifyReply } from 'fastify';
import { IssuedSession } from '../sessions/session.service.js';
import { AppConfig } from '../config/app-config.js';
import { setAuthCookies } from './cookies.js';
import { generateCsrfToken } from './csrf.js';

export interface SessionResponseBody {
  authenticated: true;
  accessToken?: string;
  refreshToken?: string;
}

export const respondWithIssuedSession = (
  session: IssuedSession,
  reply: FastifyReply,
  config: AppConfig,
): SessionResponseBody => {
  if (session.clientType === 'WEB') {
    setAuthCookies(reply, {
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      refreshTokenExpiresAt: session.refreshTokenExpiresAt,
      csrfToken: generateCsrfToken(),
      isProduction: config.environment === 'production',
    });
    return { authenticated: true };
  }

  return {
    authenticated: true,
    accessToken: session.accessToken,
    refreshToken: session.refreshToken,
  };
};
