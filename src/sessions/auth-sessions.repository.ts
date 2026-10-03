export const AUTH_SESSIONS_REPOSITORY = Symbol('AUTH_SESSIONS_REPOSITORY');
export type SessionClientTypeName = 'WEB' | 'IOS' | 'ANDROID' | 'OTHER';
export type SessionRevokedReasonName =
  | 'LOGOUT'
  | 'LOGOUT_ALL'
  | 'REUSE_DETECTED'
  | 'PASSWORD_CHANGE'
  | 'SESSION_LIMIT_EXCEEDED'
  | 'ADMIN';

export interface CreateSessionInput {
  userId: string;
  refreshTokenHash: string;
  clientType: SessionClientTypeName;
  deviceName?: string;
  expiresAt: Date;
}

export type SessionRecord = Readonly<{
  id: string;
  userId: string;
  refreshTokenHash: string;
  previousTokenHash: string | null;
  clientType: SessionClientTypeName;
  deviceName: string | null;
  createdAt: Date;
  lastUsedAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
}>;

export interface AuthSessionsRepository {
  create(input: CreateSessionInput): Promise<SessionRecord>;
  findByCurrentOrPreviousHash(hash: string): Promise<SessionRecord | null>;
  rotate(
    sessionId: string,
    input: {
      currentHash: string;
      newHash: string;
      previousHash: string;
      expiresAt: Date;
    },
  ): Promise<boolean>;
  revoke(sessionId: string, reason: SessionRevokedReasonName): Promise<void>;
  revokeAllForUser(
    userId: string,
    reason: SessionRevokedReasonName,
    exceptSessionId?: string,
  ): Promise<void>;
  findActiveForUser(userId: string): Promise<SessionRecord[]>;
}
