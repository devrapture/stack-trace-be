#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/081b63f11ea91c1382a8c554e9e79e4aa7cf8dc1d716b6075693c8ac95a3be93/contract';
import startContract from '../../snapshots/081b63f11ea91c1382a8c554e9e79e4aa7cf8dc1d716b6075693c8ac95a3be93/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/3c5d8f5216de3553746c3eb26ae048790d6da987b0909224097a9a3132843270/contract';
import endContract from '../../snapshots/3c5d8f5216de3553746c3eb26ae048790d6da987b0909224097a9a3132843270/contract.json' with { type: 'json' };
import {
  Migration,
  MigrationCLI,
  checkExpression,
  col,
  fn,
  primaryKey,
} from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createTable({
        schema: 'public',
        table: 'auth_sessions',
        columns: [
          col('client_type', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('created_at', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('device_name', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('expires_at', 'timestamptz(3)', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1', typeParams: { precision: 3 } },
          }),
          col('id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('last_used_at', 'timestamptz(3)', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1', typeParams: { precision: 3 } },
          }),
          col('previous_token_hash', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('refresh_token_hash', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('revoked_at', 'timestamptz(3)', {
            codecRef: { codecId: 'pg/timestamptz-temporal@1', typeParams: { precision: 3 } },
          }),
          col('revoked_reason', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('updated_at', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('user_id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'auth_sessions_client_type_check_a9640be8',
            "\"client_type\" IN ('WEB', 'IOS', 'ANDROID', 'OTHER')",
          ),
          checkExpression(
            'auth_sessions_revoked_reason_check_33704d4a',
            "\"revoked_reason\" IN ('LOGOUT', 'LOGOUT_ALL', 'REUSE_DETECTED', 'PASSWORD_CHANGE', 'SESSION_LIMIT_EXCEEDED', 'ADMIN')",
          ),
        ],
      }),
      this.addUnique({
        schema: 'public',
        table: 'auth_sessions',
        constraint: 'auth_sessions_refresh_token_hash_key',
        columns: ['refresh_token_hash'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'auth_sessions',
        constraint: 'auth_sessions_previous_token_hash_key',
        columns: ['previous_token_hash'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'auth_sessions',
        index: 'auth_sessions_user_id_idx_6c952402',
        columns: ['user_id'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'auth_sessions',
        foreignKey: {
          name: 'auth_sessions_user_id_fkey',
          columns: ['user_id'],
          references: { schema: 'public', table: 'users', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
