#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/46b38c4dd2f6093a6028e0005969fdd6d1a536fc4b7fd609b4415815b32c24fb/contract';
import startContract from '../../snapshots/46b38c4dd2f6093a6028e0005969fdd6d1a536fc4b7fd609b4415815b32c24fb/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/db908cf7b5b46969a1852b90e0de69fc1a670a564842a52088c83c8b932c176f/contract';
import endContract from '../../snapshots/db908cf7b5b46969a1852b90e0de69fc1a670a564842a52088c83c8b932c176f/contract.json' with { type: 'json' };
import { Migration, MigrationCLI } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createIndex({
        schema: 'public',
        table: 'audit_logs',
        index: 'audit_logs_created_at_id_idx_d7da240a',
        columns: ['created_at', 'id'],
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
