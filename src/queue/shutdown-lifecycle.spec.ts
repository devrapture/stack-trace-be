import type { DynamicModule } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PinoLogger } from 'nestjs-pino';
import type { StopOptions } from 'pg-boss';
import { vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service.js';
import { PgBossService } from './pg-boss.service.js';

vi.mock('pg-boss', () => ({
  PgBoss: class {
    on = vi.fn();
    start = vi.fn(async () => undefined);
    stop = vi.fn(async (_options?: StopOptions) => undefined);
  },
}));

vi.mock('../prisma/db.js', () => ({
  createDatabaseClient: () => ({
    connect: vi.fn(async () => undefined),
    close: vi.fn(async () => undefined),
  }),
}));

function deferred() {
  let resolve = () => {};
  const promise = new Promise<void>((callback) => {
    resolve = callback;
  });
  return { promise, resolve };
}

describe('database-dependent worker shutdown', () => {
  it.each([false, true])(
    'awaits the worker drain before closing Prisma, queue module first: %s',
    async (queueFirst) => {
      const databaseConfig = {
        database_url: 'postgres://localhost/shutdown-test',
      };
      const logger = new PinoLogger({ pinoHttp: { level: 'silent' } });
      const databaseModule: DynamicModule = {
        module: class TestDatabaseModule {},
        providers: [
          {
            provide: PrismaService,
            useFactory: () => new PrismaService(databaseConfig, logger),
          },
        ],
      };
      const queueModule: DynamicModule = {
        module: class TestQueueModule {},
        providers: [
          {
            provide: PgBossService,
            useFactory: () => new PgBossService(databaseConfig, logger),
          },
        ],
      };
      const app = await Test.createTestingModule({
        imports: queueFirst
          ? [queueModule, databaseModule]
          : [databaseModule, queueModule],
      }).compile();
      await app.init();

      const boss = app.get(PgBossService);
      const prisma = app.get(PrismaService);
      const events: string[] = [];
      const stopStarted = deferred();
      const workerDrained = deferred();
      vi.mocked(boss.client.stop).mockImplementation(async () => {
        events.push('worker stop started');
        stopStarted.resolve();
        await workerDrained.promise;
        events.push('worker drained');
      });
      vi.mocked(prisma.db.close).mockImplementation(async () => {
        events.push('Prisma closed');
      });

      const closing = app.close();
      try {
        await stopStarted.promise;
        expect(prisma.db.close).not.toHaveBeenCalled();
        expect(events).toEqual(['worker stop started']);
      } finally {
        workerDrained.resolve();
        await closing;
      }

      expect(boss.client.stop).toHaveBeenCalledExactlyOnceWith({
        graceful: true,
        timeout: 30_000,
      });
      expect(prisma.db.close).toHaveBeenCalledOnce();
      expect(events).toEqual([
        'worker stop started',
        'worker drained',
        'Prisma closed',
      ]);
    },
  );
});
