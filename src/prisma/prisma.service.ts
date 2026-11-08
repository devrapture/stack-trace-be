import {
  Inject,
  Injectable,
  OnApplicationShutdown,
  OnModuleInit,
} from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import {
  DATABASE_CONFIG,
  type DatabaseConfig,
} from '../config/database-config.js';
import { createDatabaseClient, type DatabaseClient } from './db.js';

@Injectable()
export class PrismaService implements OnModuleInit, OnApplicationShutdown {
  readonly db: DatabaseClient;

  constructor(
    @Inject(DATABASE_CONFIG) databaseConfig: DatabaseConfig,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(PrismaService.name);
    this.db = createDatabaseClient(databaseConfig.database_url);
  }

  async ping(signal?: AbortSignal): Promise<void> {
    const query = this.db.raw.sql`
              SELECT 1 AS "result"
            `
      .returnsRow({
        result: 'pg/int4@1',
      })
      .build();

    await this.db.runtime().query(query, { signal });
  }
  async onModuleInit() {
    try {
      this.logger.info('Connecting to the database');
      await this.db.connect();
      this.logger.info('Database connection successful');
    } catch (error) {
      this.logger.error({ err: error }, 'Failed to connect to database');
      throw error;
    }
  }
  async onApplicationShutdown() {
    // Keep Prisma available until database-dependent workers have drained.
    await this.db.close();
  }
}
