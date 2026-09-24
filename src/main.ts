import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module.js';
import { GlobalExceptionFilter } from './common/error/http-exception.filter.js';
import { APP_CONFIG, AppConfig } from './config/app-config.js';

const ONE_MEBIBYTE = 1_048_576;

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({
      bodyLimit: ONE_MEBIBYTE,
      trustProxy: false,
    }),
    {
      bufferLogs: true,
      rawBody: true,
      routeConflictPolicy: { duplicate: 'error', shadow: 'warn' },
      routeResolutionStrategy: 'specificity',
    },
  );
  app.enableShutdownHooks();
  const logger = app.get(Logger);
  const config = app.get<AppConfig>(APP_CONFIG);
  app.useLogger(logger);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new GlobalExceptionFilter(logger));
  app.setGlobalPrefix('api/v1');
  await app.listen(config.port, '0.0.0.0');
  logger.log(
    `Stack trace listening on port ${config.port} ${config.environment}`,
  );
}
await bootstrap();
