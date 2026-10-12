import { createHash, timingSafeEqual } from 'node:crypto';
import type { FastifyReply } from 'fastify';
import type { OAuthProviderName } from './oauth-state.repository.js';

export const OAUTH_STATE_COOKIE_TTL_SECONDS = 10 * 60;

const cookieNameFor = (provider: OAuthProviderName): string =>
  `oauth_${provider.toLowerCase()}_state`;

const cookiePathFor = (provider: OAuthProviderName): string =>
  `/api/v1/oauth/${provider.toLowerCase()}/callback`;

const hashState = (state: string): Buffer =>
  createHash('sha256').update(state).digest();

export const oauthStateCookieName = cookieNameFor;

export const setOAuthStateCookie = (
  reply: FastifyReply,
  provider: OAuthProviderName,
  state: string,
  isProduction: boolean,
): FastifyReply =>
  reply.setCookie(
    cookieNameFor(provider),
    hashState(state).toString('base64url'),
    {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      path: cookiePathFor(provider),
      maxAge: OAUTH_STATE_COOKIE_TTL_SECONDS,
    },
  );

export const clearOAuthStateCookie = (
  reply: FastifyReply,
  provider: OAuthProviderName,
): FastifyReply =>
  reply.clearCookie(cookieNameFor(provider), {
    path: cookiePathFor(provider),
  });

export const oauthStateMatchesCookie = (
  state: string,
  cookieHash: string | undefined,
): boolean => {
  if (!cookieHash) return false;

  const actualHash = hashState(state);
  const expectedHash = Buffer.from(cookieHash, 'base64url');

  return (
    actualHash.length === expectedHash.length &&
    timingSafeEqual(actualHash, expectedHash)
  );
};
