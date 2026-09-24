import { ValidatedEnvironment } from './environment.schema';

export const DATABASE_CONFIG = Symbol('DATABASE_CONFIG');

export interface DatabaseConfig {
  readonly database_url: string;
}

export const createDatabaseConfig = (
  environment: ValidatedEnvironment,
): DatabaseConfig =>
  Object.freeze({
    database_url: environment.DATABASE_URL,
  });
