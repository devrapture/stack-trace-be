import type { FastifyReply } from 'fastify';
import { vi } from 'vitest';
import {
  clearOAuthStateCookie,
  OAUTH_STATE_COOKIE_TTL_SECONDS,
  oauthStateCookieName,
  oauthStateMatchesCookie,
  setOAuthStateCookie,
} from './oauth-state-binding.js';

describe('OAuth state binding', () => {
  it('sets a short-lived provider-specific state hash cookie', () => {
    const setCookie = vi.fn().mockReturnThis();
    const reply = { setCookie } as unknown as FastifyReply;

    setOAuthStateCookie(reply, 'GOOGLE', 'oauth-state', true);

    expect(setCookie).toHaveBeenCalledWith(
      'oauth_google_state',
      expect.not.stringContaining('oauth-state'),
      {
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        path: '/api/v1/oauth/google/callback',
        maxAge: OAUTH_STATE_COOKIE_TTL_SECONDS,
      },
    );
  });

  it('matches only the state used to create the cookie hash', () => {
    let cookieHash: string | undefined;
    const reply = {
      setCookie: vi.fn((_name: string, value: string) => {
        cookieHash = value;
        return reply;
      }),
    } as unknown as FastifyReply;
    setOAuthStateCookie(reply, 'GITHUB', 'expected-state', false);

    expect(oauthStateMatchesCookie('expected-state', cookieHash)).toBe(true);
    expect(oauthStateMatchesCookie('different-state', cookieHash)).toBe(false);
    expect(oauthStateMatchesCookie('expected-state', undefined)).toBe(false);
    expect(oauthStateMatchesCookie('expected-state', 'invalid')).toBe(false);
  });

  it('clears the cookie using its callback path', () => {
    const clearCookie = vi.fn().mockReturnThis();
    const reply = { clearCookie } as unknown as FastifyReply;

    clearOAuthStateCookie(reply, 'GITHUB');

    expect(clearCookie).toHaveBeenCalledWith(oauthStateCookieName('GITHUB'), {
      path: '/api/v1/oauth/github/callback',
    });
  });
});
