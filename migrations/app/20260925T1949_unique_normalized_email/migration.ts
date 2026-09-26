#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/3bcb071fced63124639edd89630a25df3edd6814ae07ee4d3371761ee5c52702/contract';
import endContract from '../../snapshots/3bcb071fced63124639edd89630a25df3edd6814ae07ee4d3371761ee5c52702/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/e7a1ef84ea913ae99d47b25748ecd76f82e12b380f19472dbde8f0bc4beaecb2/contract';
import startContract from '../../snapshots/e7a1ef84ea913ae99d47b25748ecd76f82e12b380f19472dbde8f0bc4beaecb2/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, rawSql } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.dropIndex({
        schema: 'public',
        table: 'user_emails',
        index: 'user_emails_normalized_email_idx_77d48382',
      }),
      this.dropIndex({
        schema: 'public',
        table: 'user_emails',
        index: 'user_emails_user_id_idx_6c952402',
      }),
      this.dropConstraint({
        schema: 'public',
        table: 'user_emails',
        constraint: 'user_emails_user_id_normalized_email_key',
      }),
      // Check the default's value, so an existing DEFAULT true is not skipped.
      rawSql({
        id: 'setDefault.user_emails.is_primary',
        label: 'Set default on user_emails.is_primary to false',
        operationClass: 'widening',
        target: {
          id: 'postgres',
          details: { schema: 'public', objectType: 'column', table: 'user_emails', name: 'is_primary' },
        },
        precheck: [{
          description: 'verify is_primary exists',
          sql: 'SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2 AND column_name = $3) AS result',
          params: ['public', 'user_emails', 'is_primary'],
        }],
        execute: [{
          description: 'set is_primary default to false',
          sql: 'ALTER TABLE "public"."user_emails" ALTER COLUMN "is_primary" SET DEFAULT false',
        }],
        postcheck: [{
          description: 'verify is_primary defaults to false',
          sql: 'SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2 AND column_name = $3 AND column_default = $4) AS result',
          params: ['public', 'user_emails', 'is_primary', 'false'],
        }],
      }),
      this.addUnique({
        schema: 'public',
        table: 'user_emails',
        constraint: 'user_emails_normalized_email_key',
        columns: ['normalized_email'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'user_emails',
        index: 'user_emails_user_idx_8d2b7603',
        columns: ['user_id'],
        extras: { where: 'is_primary = true', unique: true },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
