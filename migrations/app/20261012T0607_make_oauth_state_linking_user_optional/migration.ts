#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/7d0127ee0a8ee76d950647a65dc71641f924b48f573369e428f2c2bfcbc98c3d/contract';
import startContract from '../../snapshots/7d0127ee0a8ee76d950647a65dc71641f924b48f573369e428f2c2bfcbc98c3d/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/cacac59fdde77dd582d2b7cf6cf812aaeea6dc12ca41054ceadf02c7dc60c67b/contract';
import endContract from '../../snapshots/cacac59fdde77dd582d2b7cf6cf812aaeea6dc12ca41054ceadf02c7dc60c67b/contract.json' with { type: 'json' };
import { Migration, MigrationCLI } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.dropNotNull({ schema: 'public', table: 'oauth_states', column: 'linking_user_id' }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
