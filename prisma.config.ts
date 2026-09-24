import 'dotenv/config';
import { definePrismaConfig } from '@prisma/cli-engine';
import type { PrismaNextConfig } from '@prisma/orm-framework/config/config-types';
import { defineConfig as ormConfig } from '@prisma/orm-postgres/config';

const prismaConfig: { orm: PrismaNextConfig<'sql', 'postgres'> } =
  definePrismaConfig({
    orm: ormConfig({
      contract: './src/prisma/contract.prisma',
      db: {
        connection: process.env['DATABASE_URL']!,
      },
    }),
  });

export default prismaConfig;
