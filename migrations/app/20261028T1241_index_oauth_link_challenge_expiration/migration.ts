#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/17f14006a3682311192bea559c14f3710be59d772ef7f005c82e309852244426/contract';
import startContract from '../../snapshots/17f14006a3682311192bea559c14f3710be59d772ef7f005c82e309852244426/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/8e2c6af9915848a33da2eaea4d69e21f2e31b944841a0d9504d660d5f3d64fa3/contract';
import endContract from '../../snapshots/8e2c6af9915848a33da2eaea4d69e21f2e31b944841a0d9504d660d5f3d64fa3/contract.json' with { type: 'json' };
import { Migration, MigrationCLI } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createIndex({
        schema: 'public',
        table: 'oauth_link_challenges',
        index: 'oauth_link_challenges_expires_at_idx_35365ada',
        columns: ['expires_at'],
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
