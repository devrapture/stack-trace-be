#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/3bcb071fced63124639edd89630a25df3edd6814ae07ee4d3371761ee5c52702/contract';
import endContract from '../../snapshots/3bcb071fced63124639edd89630a25df3edd6814ae07ee4d3371761ee5c52702/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/e7a1ef84ea913ae99d47b25748ecd76f82e12b380f19472dbde8f0bc4beaecb2/contract';
import startContract from '../../snapshots/e7a1ef84ea913ae99d47b25748ecd76f82e12b380f19472dbde8f0bc4beaecb2/contract.json' with { type: 'json' };
import { Migration, MigrationCLI } from '@prisma/orm-postgres/migration';

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
      this.setDefault({
        schema: 'public',
        table: 'user_emails',
        column: 'is_primary',
        defaultSql: 'DEFAULT false',
        operationClass: 'widening',
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
