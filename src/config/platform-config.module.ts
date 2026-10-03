import { FactoryProvider, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
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
  OTP_HASH_SECRET: config.getOrThrow('OTP_HASH_SECRET', {
    infer: true,
  }),
  RESEND_API_KEY: config.getOrThrow('RESEND_API_KEY', {
    infer: true,
  }),
  RESEND_FROM_EMAIL: config.getOrThrow('RESEND_FROM_EMAIL', {
    infer: true,
  }),
  RESEND_FROM_NAME: config.getOrThrow('RESEND_FROM_NAME', {
    infer: true,
  }),
  JWT_KID: config.getOrThrow('JWT_KID', {
    infer: true,
  }),
  JWT_PRIVATE_KEY: config.getOrThrow('JWT_PRIVATE_KEY', {
    infer: true,
  }),
  JWT_PUBLIC_KEY: config.getOrThrow('JWT_PUBLIC_KEY', {
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
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
  ],
  providers: [
    appConfigProvider,
    databaseConfigProvider,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
  exports: [APP_CONFIG, DATABASE_CONFIG],
})
export class PlatformConfigModule {}
