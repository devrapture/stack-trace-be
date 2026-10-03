#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/3c5d8f5216de3553746c3eb26ae048790d6da987b0909224097a9a3132843270/contract';
import startContract from '../../snapshots/3c5d8f5216de3553746c3eb26ae048790d6da987b0909224097a9a3132843270/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/4342a0c855249d61e3b42e68dbd76f35b2634777bed3e3c732634b8e265c9078/contract';
import endContract from '../../snapshots/4342a0c855249d61e3b42e68dbd76f35b2634777bed3e3c732634b8e265c9078/contract.json' with { type: 'json' };
import { Migration, MigrationCLI } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.setDefault({
        schema: 'public',
        table: 'auth_sessions',
        column: 'last_used_at',
        defaultSql: 'DEFAULT (now())',
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
