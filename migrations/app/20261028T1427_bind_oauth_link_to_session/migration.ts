#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/8e2c6af9915848a33da2eaea4d69e21f2e31b944841a0d9504d660d5f3d64fa3/contract';
import startContract from '../../snapshots/8e2c6af9915848a33da2eaea4d69e21f2e31b944841a0d9504d660d5f3d64fa3/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/b4e981c291150bcebb88c4daa0c533d99912f4fc5a6665e05a60efab45290f95/contract';
import endContract from '../../snapshots/b4e981c291150bcebb88c4daa0c533d99912f4fc5a6665e05a60efab45290f95/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addColumn({
        schema: 'public',
        table: 'oauth_states',
        column: col('linking_session_id', 'uuid', { codecRef: { codecId: 'pg/uuid@1' } }),
      }),
      this.createIndex({
        schema: 'public',
        table: 'oauth_states',
        index: 'oauth_states_linking_session_id_idx_cc1618f9',
        columns: ['linking_session_id'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'oauth_states',
        foreignKey: {
          name: 'oauth_states_linking_session_id_fkey',
          columns: ['linking_session_id'],
          references: { schema: 'public', table: 'auth_sessions', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
