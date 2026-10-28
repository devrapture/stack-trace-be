import { FieldOutputTypes } from '../prisma/contract';
import { TransactionClient } from '../prisma/db';
import type { SessionClientTypeName } from './session-client-type.js';

export const AUTH_SESSIONS_REPOSITORY = Symbol('AUTH_SESSIONS_REPOSITORY');
export type { SessionClientTypeName } from './session-client-type.js';
export type AuthSessionFields = FieldOutputTypes['public']['AuthSession'];
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
  clientType: SessionClientTypeName;
  deviceName: string | null;
  createdAt: Date;
  lastUsedAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
}>;

export interface AuthSessionsRepository {
  createEnforcingLimit(
    input: CreateSessionInput,
    maxActiveSessions: number,
  ): Promise<SessionRecord>;
  findByCurrentOrPreviousHash(hash: string): Promise<AuthSessionFields | null>;
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
    db?: TransactionClient,
  ): Promise<void>;
  findActiveForUser(userId: string): Promise<SessionRecord[]>;
  findById(sessionId: string): Promise<SessionRecord | null>;
  findByIdForUpdate(
    sessionId: string,
    tx: TransactionClient,
  ): Promise<SessionRecord | null>;
}
