#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/7a212585f1b4b0bd2f83304aaa4cef65475082963521651ff9f3f762f98adae1/contract';
import endContract from '../../snapshots/7a212585f1b4b0bd2f83304aaa4cef65475082963521651ff9f3f762f98adae1/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/db908cf7b5b46969a1852b90e0de69fc1a670a564842a52088c83c8b932c176f/contract';
import startContract from '../../snapshots/db908cf7b5b46969a1852b90e0de69fc1a670a564842a52088c83c8b932c176f/contract.json' with { type: 'json' };
import {
  Migration,
  MigrationCLI,
  checkExpression,
  col,
  lit,
  primaryKey,
} from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createTable({
        schema: 'public',
        table: 'oauth_link_challenges',
        columns: [
          col('attempt_count', 'int4', {
            notNull: true,
            default: lit(0),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('consumed_at', 'timestamptz(3)', {
            codecRef: { codecId: 'pg/timestamptz-temporal@1', typeParams: { precision: 3 } },
          }),
          col('expires_at', 'timestamptz(3)', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1', typeParams: { precision: 3 } },
          }),
          col('id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('max_attempts', 'int4', {
            notNull: true,
            default: lit(5),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('otp_hash', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('provider', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('provider_subject', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('updated_at', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('user_id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'oauth_link_challenges_provider_check_5918ff78',
            "\"provider\" IN ('GOOGLE', 'GITHUB')",
          ),
        ],
      }),
      this.createIndex({
        schema: 'public',
        table: 'oauth_link_challenges',
        index: 'oauth_link_challenges_user_id_idx_6c952402',
        columns: ['user_id'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'oauth_link_challenges',
        foreignKey: {
          name: 'oauth_link_challenges_user_id_fkey',
          columns: ['user_id'],
          references: { schema: 'public', table: 'users', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
