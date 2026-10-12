#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/7d0127ee0a8ee76d950647a65dc71641f924b48f573369e428f2c2bfcbc98c3d/contract';
import endContract from '../../snapshots/7d0127ee0a8ee76d950647a65dc71641f924b48f573369e428f2c2bfcbc98c3d/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/ab1e5b08e1e11fbe4bd4f8c5c1f13b49cba66530f023ce6bbbfe947ec6cc94f2/contract';
import startContract from '../../snapshots/ab1e5b08e1e11fbe4bd4f8c5c1f13b49cba66530f023ce6bbbfe947ec6cc94f2/contract.json' with { type: 'json' };
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
        table: 'oauth_states',
        columns: [
          col('client_type', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('consumed_at', 'timestamptz(3)', {
            codecRef: { codecId: 'pg/timestamptz-temporal@1', typeParams: { precision: 3 } },
          }),
          col('created_at', 'timestamptz(3)', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1', typeParams: { precision: 3 } },
          }),
          col('expires_at', 'timestamptz(3)', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1', typeParams: { precision: 3 } },
          }),
          col('id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('intent', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('linking_user_id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('nonce', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('pkce_verifier', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('provider', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('redirect_uri', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('state', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'oauth_states_client_type_check_a9640be8',
            "\"client_type\" IN ('WEB', 'IOS', 'ANDROID', 'OTHER')",
          ),
          checkExpression('oauth_states_intent_check_3c7e161e', "\"intent\" IN ('LOGIN', 'LINK')"),
          checkExpression(
            'oauth_states_provider_check_5918ff78',
            "\"provider\" IN ('GOOGLE', 'GITHUB')",
          ),
        ],
      }),
      this.addUnique({
        schema: 'public',
        table: 'oauth_states',
        constraint: 'oauth_states_state_key',
        columns: ['state'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'oauth_states',
        index: 'oauth_states_linking_user_id_idx_db1e27f9',
        columns: ['linking_user_id'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'oauth_states',
        foreignKey: {
          name: 'oauth_states_linking_user_id_fkey',
          columns: ['linking_user_id'],
          references: { schema: 'public', table: 'users', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
