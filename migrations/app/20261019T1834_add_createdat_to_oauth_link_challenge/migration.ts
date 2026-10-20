#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/17f14006a3682311192bea559c14f3710be59d772ef7f005c82e309852244426/contract';
import endContract from '../../snapshots/17f14006a3682311192bea559c14f3710be59d772ef7f005c82e309852244426/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/7a212585f1b4b0bd2f83304aaa4cef65475082963521651ff9f3f762f98adae1/contract';
import startContract from '../../snapshots/7a212585f1b4b0bd2f83304aaa4cef65475082963521651ff9f3f762f98adae1/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, fn } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addColumn({
        schema: 'public',
        table: 'oauth_link_challenges',
        column: col('created_at', 'timestamptz(3)', {
          notNull: true,
          default: fn('now()'),
          codecRef: { codecId: 'pg/timestamptz-temporal@1', typeParams: { precision: 3 } },
        }),
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
