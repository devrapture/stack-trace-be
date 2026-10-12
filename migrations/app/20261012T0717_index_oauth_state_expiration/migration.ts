#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/a2503eabe57d1bcfae3d6eef9a3d68e1f854389b424f379740e62262612cd40b/contract';
import endContract from '../../snapshots/a2503eabe57d1bcfae3d6eef9a3d68e1f854389b424f379740e62262612cd40b/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/cacac59fdde77dd582d2b7cf6cf812aaeea6dc12ca41054ceadf02c7dc60c67b/contract';
import startContract from '../../snapshots/cacac59fdde77dd582d2b7cf6cf812aaeea6dc12ca41054ceadf02c7dc60c67b/contract.json' with { type: 'json' };
import { Migration, MigrationCLI } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createIndex({
        schema: 'public',
        table: 'oauth_states',
        index: 'oauth_states_expires_at_idx_35365ada',
        columns: ['expires_at'],
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
