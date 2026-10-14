import type { JsonValue } from '@prisma/orm-postgres/target/codec-types';
import { TransactionClient } from '../prisma/db';
import { Temporal } from 'temporal-polyfill/full';

export const AUDIT_LOG_REPOSITORY = Symbol('AUDIT_LOG_REPOSITORY');

export type AuditEventTypeName =
  | 'PASSWORD_RESET'
  | 'PASSWORD_CHANGED'
  | 'PASSWORD_ADDED'
  | 'PROVIDER_LINKED'
  | 'PROVIDER_UNLINKED'
  | 'ADMIN_ROLE_GRANTED'
  | 'ADMIN_ROLE_REVOKED';

export type AuditLogCursor = {
  createdAt: Temporal.Instant;
  id: string;
};

export interface RecordAuditEventInput {
  /** Who the event is ABOUT. */
  userId: string;
  /** Who PERFORMED it, when different from `userId` — e.g. a future
   * admin-promotes-another-user action. Omitted for self-performed
   * events and for the create-admin CLI script, which has no
   * authenticated actor at all. */
  actorUserId?: string;
  eventType: AuditEventTypeName;
  metadata?: JsonValue;
}

export interface AuditLogEntry {
  id: string;
  userId: string | null;
  actorUserId: string | null;
  eventType: AuditEventTypeName;
  metadata: JsonValue | null;
  createdAt: Date;
}

/**
 * Persistence port for `AuditLog`. `record`'s optional `tx` is what
 * lets every caller (password reset, password change, provider
 * linking...) write its audit entry in the SAME transaction as the
 * change it's recording — the action and its own audit trail commit
 * or roll back together, never one without the other.
 */
export interface AuditLogRepository {
  record(input: RecordAuditEventInput, tx?: TransactionClient): Promise<void>;

  list(options: {
    limit: number;
    cursor?: AuditLogCursor;
  }): Promise<AuditLogEntry[]>;
}
