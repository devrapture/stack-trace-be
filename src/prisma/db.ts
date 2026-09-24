import postgres from '@prisma/orm-postgres/runtime';
import type { Contract } from './contract.d';
import contractJson from './contract.json' with { type: 'json' };

export const createDatabaseClient = (url: string) =>
  postgres<Contract>({
    contractJson,
    url,
  });

export type DatabaseClient = ReturnType<typeof createDatabaseClient>;
