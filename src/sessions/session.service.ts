import { Inject, Injectable } from '@nestjs/common';
import {
  USERS_REPOSITORY,
  type UsersRepository,
} from '../users/users.repository.js';
import { AccessTokenService } from './access-token.service.js';
import {
  AUTH_SESSIONS_REPOSITORY,
  SessionRevokedReasonName,
  type AuthSessionsRepository,
} from './auth-sessions.repository.js';
import { generateRefreshToken, hashRefreshToken } from './refresh-token.js';
import type { SessionClientTypeName } from './session-client-type.js';
import {
  InvalidRefreshTokenError,
  RefreshTokenReuseDetectedError,
} from './session-errors.js';

const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_ACTIVE_SESSIONS_PER_USER = 10;

export interface DeviceInfo {
  clientType: SessionClientTypeName;
  deviceName?: string;
}

export interface IssuedSession {
  accessToken: string;
  refreshToken: string;
  sessionId: string;
  refreshTokenExpiresAt: Date;
  clientType: SessionClientTypeName;
}

@Injectable()
export class SessionService {
  constructor(
    @Inject(AUTH_SESSIONS_REPOSITORY)
    private prismaAuthSession: AuthSessionsRepository,
    private accessTokenService: AccessTokenService,
    @Inject(USERS_REPOSITORY)
    private userRepository: UsersRepository,
  ) {}

  async createSession(
    userId: string,
    device: DeviceInfo,
  ): Promise<IssuedSession> {
    await this.enforceSessionLimit(userId);
    const refreshToken = generateRefreshToken();
    const refreshTokenHash = hashRefreshToken(refreshToken);
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);
    const session = await this.prismaAuthSession.createEnforcingLimit(
      {
        userId,
        refreshTokenHash,
        clientType: device.clientType,
        ...(device.deviceName ? { deviceName: device.deviceName } : {}),
        expiresAt,
      },
      MAX_ACTIVE_SESSIONS_PER_USER,
    );
    const accessToken = await this.accessTokenService.sign({
      sid: session.id,
      sub: userId,
    });
    return {
      accessToken,
      refreshToken,
      sessionId: session.id,
      refreshTokenExpiresAt: expiresAt,
      clientType: device.clientType,
    };
  }

  async rotateRefreshToken(presentedToken: string): Promise<IssuedSession> {
    const hash = hashRefreshToken(presentedToken);
    const session =
      await this.prismaAuthSession.findByCurrentOrPreviousHash(hash);
    if (
      !session ||
      session.revokedAt ||
      session.expiresAt.getTime() < Date.now()
    )
      throw new InvalidRefreshTokenError();

    const user = await this.userRepository.getUserById(session.userId);
    if (!user || user.status !== 'ACTIVE') {
      await this.prismaAuthSession.revoke(session.id, 'ADMIN');
      throw new InvalidRefreshTokenError();
    }

    if (session.previousTokenHash === hash) {
      await this.prismaAuthSession.revoke(session.id, 'REUSE_DETECTED');
      throw new RefreshTokenReuseDetectedError();
    }

    const newRefreshToken = generateRefreshToken();
    const newRefreshTokenHash = hashRefreshToken(newRefreshToken);
    const newExpiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);

    const isRotated = await this.prismaAuthSession.rotate(session.id, {
      currentHash: hash,
      newHash: newRefreshTokenHash,
      previousHash: hash,
      expiresAt: newExpiresAt,
    });

    if (!isRotated) throw new InvalidRefreshTokenError();

    const accessToken = await this.accessTokenService.sign({
      sid: session.id,
      sub: session.userId,
    });

    return {
      accessToken,
      refreshToken: newRefreshToken,
      sessionId: session.id,
      refreshTokenExpiresAt: newExpiresAt,
      clientType: session.clientType,
    };
  }

  async revokeSession(
    sessionId: string,
    reason: SessionRevokedReasonName,
  ): Promise<void> {
    await this.prismaAuthSession.revoke(sessionId, reason);
  }

  async revokeAllForUser(
    userId: string,
    reason: SessionRevokedReasonName,
    exceptSessionId?: string,
  ): Promise<void> {
    await this.prismaAuthSession.revokeAllForUser(
      userId,
      reason,
      exceptSessionId,
    );
  }

  private async enforceSessionLimit(userId: string) {
    const activeSessions =
      await this.prismaAuthSession.findActiveForUser(userId);

    if (activeSessions.length >= MAX_ACTIVE_SESSIONS_PER_USER) {
      const oldest = activeSessions[0];
      if (oldest) {
        await this.prismaAuthSession.revoke(
          oldest.id,
          'SESSION_LIMIT_EXCEEDED',
        );
      }
    }
  }
}
