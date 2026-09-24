import { FactoryProvider, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_CONFIG, createAppConfig } from './app-config.js';
import { createDatabaseConfig, DATABASE_CONFIG } from './database-config.js';
import {
  environmentSchema,
  ValidatedEnvironment,
} from './environment.schema.js';

const readValidatedEnvironment = (
  config: ConfigService<ValidatedEnvironment, true>,
): ValidatedEnvironment => ({
  NODE_ENV: config.getOrThrow('NODE_ENV', {
    infer: true,
  }),
  LOG_LEVEL: config.getOrThrow('LOG_LEVEL', {
    infer: true,
  }),
  PORT: config.getOrThrow('PORT', {
    infer: true,
  }),
  DATABASE_URL: config.getOrThrow('DATABASE_URL', {
    infer: true,
  }),
});

const appConfigProvider: FactoryProvider = {
  provide: APP_CONFIG,
  inject: [ConfigService],
  useFactory: (configService: ConfigService<ValidatedEnvironment, true>) =>
    createAppConfig(readValidatedEnvironment(configService)),
};

const databaseConfigProvider: FactoryProvider = {
  provide: DATABASE_CONFIG,
  inject: [ConfigService],
  useFactory: (configService: ConfigService<ValidatedEnvironment, true>) =>
    createDatabaseConfig(readValidatedEnvironment(configService)),
};

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      expandVariables: false,
      validationSchema: environmentSchema,
      validationOptions: {
        libraryOptions: {
          abortEarly: false,
          allowUnknown: true,
        },
      },
    }),
  ],
  providers: [appConfigProvider, databaseConfigProvider],
  exports: [APP_CONFIG, DATABASE_CONFIG],
})
export class PlatformConfigModule {}
