import type { FastifyReply, FastifyRequest } from 'fastify';
import { vi } from 'vitest';
import type { AppConfig } from '../config/app-config.js';
import type { IdentityLinkingService } from './identity-linking.service.js';
import { OauthController } from './oauth.controller.js';
import type { OAuthLoginService } from './oauth-login.service.js';
import { oauthStateCookieName } from './oauth-state-binding.js';

const config = {
  environment: 'development',
  publicBaseUrl: 'http://localhost:3000',
} as AppConfig;

const createReply = () => {
  const reply = {
    clearCookie: vi.fn(),
    redirect: vi.fn(),
    setCookie: vi.fn(),
  };
  reply.clearCookie.mockReturnValue(reply);
  reply.redirect.mockReturnValue(reply);
  reply.setCookie.mockReturnValue(reply);
  return reply;
};

describe('OauthController state binding', () => {
  it('sets a binding cookie before redirecting a WEB client', async () => {
    const start = vi.fn().mockResolvedValue({
      authorizationUrl: 'https://accounts.google.com/authorize',
      state: 'oauth-state',
    });
    const controller = new OauthController(
      config,
      {
        start,
      } as unknown as OAuthLoginService,
      {} as IdentityLinkingService,
    );
    const reply = createReply();

    await controller.googleStart(
      { clientType: 'WEB' },
      reply as unknown as FastifyReply,
    );

    expect(reply.setCookie).toHaveBeenCalledWith(
      oauthStateCookieName('GOOGLE'),
      expect.any(String),
      expect.objectContaining({
        httpOnly: true,
        sameSite: 'lax',
        maxAge: 600,
      }),
    );
    expect(reply.redirect).toHaveBeenCalledWith(
      'https://accounts.google.com/authorize',
      302,
    );
  });

  it('rejects non-WEB clients before creating OAuth state', async () => {
    const start = vi.fn();
    const controller = new OauthController(
      config,
      {
        start,
      } as unknown as OAuthLoginService,
      {} as IdentityLinkingService,
    );

    await expect(
      controller.githubStart(
        { clientType: 'OTHER' },
        createReply() as unknown as FastifyReply,
      ),
    ).rejects.toMatchObject({ code: 'bad_request', httpStatus: 400 });
    expect(start).not.toHaveBeenCalled();
  });

  it('requires the callback state to match the initiating browser cookie', async () => {
    const handleCallback = vi.fn();
    const controller = new OauthController(
      config,
      {
        handleCallback,
      } as unknown as OAuthLoginService,
      {} as IdentityLinkingService,
    );
    const reply = createReply();
    const request = {
      cookies: {},
      url: '/api/v1/oauth/google/callback?state=oauth-state&code=code',
    } as unknown as FastifyRequest;

    await expect(
      controller.googleCallback(request, reply as unknown as FastifyReply),
    ).rejects.toMatchObject({
      code: 'oauth_state_invalid',
      httpStatus: 400,
    });
    expect(handleCallback).not.toHaveBeenCalled();
    expect(reply.clearCookie).not.toHaveBeenCalled();
  });

  it('does not clear a newer sign-in cookie when a stale callback arrives', async () => {
    const start = vi
      .fn()
      .mockResolvedValueOnce({
        authorizationUrl: 'https://accounts.google.com/authorize',
        state: 'old-state',
      })
      .mockResolvedValueOnce({
        authorizationUrl: 'https://accounts.google.com/authorize',
        state: 'new-state',
      });
    const handleCallback = vi.fn();
    const controller = new OauthController(
      config,
      {
        start,
        handleCallback,
      } as unknown as OAuthLoginService,
      {} as IdentityLinkingService,
    );
    const firstReply = createReply();
    const secondReply = createReply();
    await controller.googleStart(
      { clientType: 'WEB' },
      firstReply as unknown as FastifyReply,
    );
    await controller.googleStart(
      { clientType: 'WEB' },
      secondReply as unknown as FastifyReply,
    );
    const newerStateCookie = secondReply.setCookie.mock.calls[0]?.[1] as string;
    const callbackReply = createReply();
    const staleRequest = {
      cookies: {
        [oauthStateCookieName('GOOGLE')]: newerStateCookie,
      },
      url: '/api/v1/oauth/google/callback?state=old-state&code=code',
    } as unknown as FastifyRequest;

    await expect(
      controller.googleCallback(
        staleRequest,
        callbackReply as unknown as FastifyReply,
      ),
    ).rejects.toMatchObject({
      code: 'oauth_state_invalid',
      httpStatus: 400,
    });
    expect(handleCallback).not.toHaveBeenCalled();
    expect(callbackReply.clearCookie).not.toHaveBeenCalled();
  });

  it('accepts a callback bound to the initiating browser and clears the cookie', async () => {
    const start = vi.fn().mockResolvedValue({
      authorizationUrl: 'https://accounts.google.com/authorize',
      state: 'oauth-state',
    });
    const session = {
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      refreshTokenExpiresAt: new Date('2026-11-12T08:00:00Z'),
      sessionId: 'session-id',
      clientType: 'WEB',
    };
    const handleCallback = vi.fn().mockResolvedValue({
      kind: 'session',
      session,
    });
    const controller = new OauthController(
      config,
      {
        start,
        handleCallback,
      } as unknown as OAuthLoginService,
      {} as IdentityLinkingService,
    );
    const reply = createReply();
    await controller.googleStart(
      { clientType: 'WEB' },
      reply as unknown as FastifyReply,
    );
    const stateCookie = reply.setCookie.mock.calls[0]?.[1] as string;
    const request = {
      cookies: {
        [oauthStateCookieName('GOOGLE')]: stateCookie,
      },
      url: '/api/v1/oauth/google/callback?state=oauth-state&code=code',
    } as unknown as FastifyRequest;

    await expect(
      controller.googleCallback(request, reply as unknown as FastifyReply),
    ).resolves.toEqual({ authenticated: true });

    expect(handleCallback).toHaveBeenCalledOnce();
    expect(reply.clearCookie).toHaveBeenCalledWith(
      oauthStateCookieName('GOOGLE'),
      expect.any(Object),
    );
  });
});
