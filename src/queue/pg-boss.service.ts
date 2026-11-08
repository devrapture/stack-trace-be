import {
  Inject,
  Injectable,
  OnApplicationShutdown,
  OnModuleInit,
} from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { PgBoss } from 'pg-boss';
import {
  DATABASE_CONFIG,
  type DatabaseConfig,
} from '../config/database-config.js';

@Injectable()
export class PgBossService implements OnModuleInit, OnApplicationShutdown {
  readonly client: PgBoss;
  constructor(
    @Inject(DATABASE_CONFIG) databaseConfig: DatabaseConfig,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(PgBossService.name);

    this.client = new PgBoss({
      connectionString: databaseConfig.database_url,
      schema: 'pgboss',
      max: 5,
      connectionTimeoutMillis: 10_000,
      application_name: 'stack_trace-jobs',
      persistQueueStats: true,
      persistWarnings: true,
    });

    this.client.on('error', (error) => {
      this.logger.error(
        {
          errorName: error.name,
        },
        'pg-boss database error',
      );
    });
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.client.start();
    } catch (error) {
      await this.client.stop({ graceful: false });
      throw error;
    }
  }
  async onApplicationShutdown() {
    await this.client.stop({
      graceful: true,
      timeout: 30_000,
    });
  }
}
