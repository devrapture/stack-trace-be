#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/46b38c4dd2f6093a6028e0005969fdd6d1a536fc4b7fd609b4415815b32c24fb/contract';
import endContract from '../../snapshots/46b38c4dd2f6093a6028e0005969fdd6d1a536fc4b7fd609b4415815b32c24fb/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/a2503eabe57d1bcfae3d6eef9a3d68e1f854389b424f379740e62262612cd40b/contract';
import startContract from '../../snapshots/a2503eabe57d1bcfae3d6eef9a3d68e1f854389b424f379740e62262612cd40b/contract.json' with { type: 'json' };
import {
  Migration,
  MigrationCLI,
  checkExpression,
  col,
  fn,
  primaryKey,
  rawSql,
} from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.dropCheckConstraint({
        schema: 'public',
        table: 'users',
        constraint: 'users_role_check_1954e8c0',
      }),
      rawSql({
        id: 'data.users.role.user_to_player',
        label: 'Rename existing USER roles to PLAYER',
        operationClass: 'data',
        target: {
          id: 'postgres',
          details: {
            schema: 'public',
            objectType: 'column',
            table: 'users',
            name: 'role',
          },
        },
        precheck: [
          {
            description: 'verify existing roles can be migrated',
            sql: `SELECT NOT EXISTS (
              SELECT 1
              FROM "public"."users"
              WHERE "role" NOT IN ('USER', 'PLAYER', 'ADMIN')
            ) AS result`,
          },
        ],
        execute: [
          {
            description: 'rename USER roles to PLAYER',
            sql: `UPDATE "public"."users"
              SET "role" = 'PLAYER'
              WHERE "role" = 'USER'`,
          },
        ],
        postcheck: [
          {
            description: 'verify no USER roles remain',
            sql: `SELECT NOT EXISTS (
              SELECT 1 FROM "public"."users" WHERE "role" = 'USER'
            ) AS result`,
          },
        ],
      }),
      this.createTable({
        schema: 'public',
        table: 'audit_logs',
        columns: [
          col('actor_user_id', 'uuid', { codecRef: { codecId: 'pg/uuid@1' } }),
          col('created_at', 'timestamptz(3)', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1', typeParams: { precision: 3 } },
          }),
          col('event_type', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'uuid', { notNull: true, codecRef: { codecId: 'pg/uuid@1' } }),
          col('metadata', 'jsonb', { codecRef: { codecId: 'pg/jsonb@1' } }),
          col('user_id', 'uuid', { codecRef: { codecId: 'pg/uuid@1' } }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'audit_logs_event_type_check_a7c68cf2',
            "\"event_type\" IN ('PASSWORD_RESET', 'PASSWORD_CHANGED', 'PASSWORD_ADDED', 'PROVIDER_LINKED', 'PROVIDER_UNLINKED', 'ADMIN_ROLE_GRANTED', 'ADMIN_ROLE_REVOKED')",
          ),
        ],
      }),
      rawSql({
        id: 'setDefault.users.role',
        label: 'Set default on users.role to PLAYER',
        operationClass: 'widening',
        target: {
          id: 'postgres',
          details: {
            schema: 'public',
            objectType: 'column',
            table: 'users',
            name: 'role',
          },
        },
        precheck: [
          {
            description: 'verify users.role exists',
            sql: `SELECT EXISTS (
              SELECT 1
              FROM information_schema.columns
              WHERE table_schema = $1
                AND table_name = $2
                AND column_name = $3
            ) AS result`,
            params: ['public', 'users', 'role'],
          },
        ],
        execute: [
          {
            description: 'set users.role default to PLAYER',
            sql: `ALTER TABLE "public"."users"
              ALTER COLUMN "role" SET DEFAULT 'PLAYER'`,
          },
        ],
        postcheck: [
          {
            description: 'verify users.role defaults to PLAYER',
            sql: `SELECT EXISTS (
              SELECT 1
              FROM information_schema.columns
              WHERE table_schema = $1
                AND table_name = $2
                AND column_name = $3
                AND column_default = $4
            ) AS result`,
            params: ['public', 'users', 'role', "'PLAYER'::text"],
          },
        ],
      }),
      this.addCheckConstraint({
        schema: 'public',
        table: 'users',
        constraint: 'users_role_check_f6d86ad7',
        expression: "\"role\" IN ('PLAYER', 'ADMIN')",
      }),
      this.createIndex({
        schema: 'public',
        table: 'audit_logs',
        index: 'audit_logs_actor_user_id_idx_c46ca325',
        columns: ['actor_user_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'audit_logs',
        index: 'audit_logs_event_type_idx_8ee05680',
        columns: ['event_type'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'audit_logs',
        index: 'audit_logs_user_id_idx_6c952402',
        columns: ['user_id'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'audit_logs',
        foreignKey: {
          name: 'audit_logs_user_id_fkey',
          columns: ['user_id'],
          references: { schema: 'public', table: 'users', columns: ['id'] },
          onDelete: 'setNull',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'audit_logs',
        foreignKey: {
          name: 'audit_logs_actor_user_id_fkey',
          columns: ['actor_user_id'],
          references: { schema: 'public', table: 'users', columns: ['id'] },
          onDelete: 'setNull',
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
