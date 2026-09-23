import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module.js';
import { APP_CONFIG, AppConfig } from './config/app-config.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();
  const logger = app.get(Logger);
  const config = app.get<AppConfig>(APP_CONFIG);
  app.useLogger(logger);
  await app.listen(config.port, '0.0.0.0');
  logger.log(
    `Stack trace listening on port ${config.port} ${config.environment}`,
  );
}
await bootstrap();
