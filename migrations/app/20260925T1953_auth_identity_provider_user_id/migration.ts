#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/3bcb071fced63124639edd89630a25df3edd6814ae07ee4d3371761ee5c52702/contract';
import startContract from '../../snapshots/3bcb071fced63124639edd89630a25df3edd6814ae07ee4d3371761ee5c52702/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/47b80f6e0a40f84788e6dc8a786d8d9f272e346998dd7ff90bbf37dd10450335/contract';
import endContract from '../../snapshots/47b80f6e0a40f84788e6dc8a786d8d9f272e346998dd7ff90bbf37dd10450335/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addColumn({
        schema: 'public',
        table: 'auth_identities',
        column: col('provider_user_id', 'text', {
          notNull: true,
          codecRef: { codecId: 'pg/text@1' },
        }),
      }),
      this.addUnique({
        schema: 'public',
        table: 'auth_identities',
        constraint: 'auth_identities_provider_provider_user_id_key',
        columns: ['provider', 'provider_user_id'],
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
