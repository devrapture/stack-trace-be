import {
  Inject,
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import {
  DATABASE_CONFIG,
  type DatabaseConfig,
} from '../config/database-config.js';
import { createDatabaseClient, type DatabaseClient } from './db.js';

@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  readonly db: DatabaseClient;

  constructor(
    @Inject(DATABASE_CONFIG) databaseConfig: DatabaseConfig,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(PrismaService.name);
    this.db = createDatabaseClient(databaseConfig.database_url);
  }

  async ping(): Promise<void> {
    const query = this.db.raw.sql`
              SELECT 1 AS "result"
            `
      .returnsRow({
        result: 'pg/int4@1',
      })
      .build();

    await this.db.runtime().query(query);
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
  async onModuleDestroy() {
    await this.db.close();
  }
}
