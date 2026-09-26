#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/47b80f6e0a40f84788e6dc8a786d8d9f272e346998dd7ff90bbf37dd10450335/contract';
import startContract from '../../snapshots/47b80f6e0a40f84788e6dc8a786d8d9f272e346998dd7ff90bbf37dd10450335/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/d1d40059a5f42c9e867d7c1b4eda5c727a286ca2f707692c5b04c9f38b500074/contract';
import endContract from '../../snapshots/d1d40059a5f42c9e867d7c1b4eda5c727a286ca2f707692c5b04c9f38b500074/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, fn, primaryKey, rawSql } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.dropConstraint({
        schema: 'public',
        table: 'auth_identities',
        constraint: 'auth_identities_provider_provider_user_id_key',
      }),
      // Preserve existing provider IDs when changing the column name.
      rawSql({
        id: 'renameColumn.auth_identities.provider_user_id.provider_subject',
        label: 'Rename provider_user_id to provider_subject',
        operationClass: 'widening',
        target: {
          id: 'postgres',
          details: { schema: 'public', objectType: 'column', table: 'auth_identities', name: 'provider_subject' },
        },
        precheck: [{
          description: 'verify old column exists and new column is absent',
          sql: 'SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2 AND column_name = $3) AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2 AND column_name = $4) AS result',
          params: ['public', 'auth_identities', 'provider_user_id', 'provider_subject'],
        }],
        execute: [{
          description: 'rename provider ID column without losing values',
          sql: 'ALTER TABLE "public"."auth_identities" RENAME COLUMN "provider_user_id" TO "provider_subject"',
        }],
        postcheck: [{
          description: 'verify new column exists and old column is absent',
          sql: 'SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2 AND column_name = $3) AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2 AND column_name = $4) AS result',
          params: ['public', 'auth_identities', 'provider_subject', 'provider_user_id'],
        }],
      }),
      this.dropNotNull({ schema: 'public', table: 'auth_identities', column: 'provider_subject' }),
      this.createTable({
        schema: 'public',
        table: 'password_credential',
        columns: [
          col('auth_identity_id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('created_at', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('password_hash', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('updated_at', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.addUnique({
        schema: 'public',
        table: 'auth_identities',
        constraint: 'auth_identities_provider_provider_subject_key',
        columns: ['provider', 'provider_subject'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'password_credential',
        constraint: 'password_credential_auth_identity_id_key',
        columns: ['auth_identity_id'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'password_credential',
        foreignKey: {
          name: 'password_credential_auth_identity_id_fkey',
          columns: ['auth_identity_id'],
          references: { schema: 'public', table: 'auth_identities', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
