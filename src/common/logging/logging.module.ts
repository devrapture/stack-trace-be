import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { APP_CONFIG, AppConfig } from '../../config/app-config.js';
import { PlatformConfigModule } from '../../config/platform-config.module.js';
import { LOG_REDACTION_PATHS } from './log-redaction.js';
import { REQUEST_ID_HEADER, resolveRequestId } from './request-id.js';
import { IncomingMessage } from 'http';
import { ServerResponse } from 'http';

@Module({
  imports: [
    LoggerModule.forRootAsync({
      imports: [PlatformConfigModule],
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => {
        const isDev = config.environment === 'development';
        return {
          pinoHttp: {
            level: config.logLevel,
            name: 'stack-trace-backend',
            transport: isDev
              ? {
                  target: 'pino-pretty',
                  options: {
                    colorize: true,
                    singleLine: true,
                    translateTime: 'SYS:standard',
                    ignore: 'pid,hostname',
                  },
                }
              : undefined,
            genReqId: (req: IncomingMessage, res: ServerResponse) => {
              const requestId = resolveRequestId(
                req.headers[REQUEST_ID_HEADER],
              );
              res.setHeader(REQUEST_ID_HEADER, requestId);
              return requestId;
            },
            redact: {
              paths: [...LOG_REDACTION_PATHS],
              censor: '[REDACTED]',
            },
            serializers: {
              req: (req) => ({
                method: req.method,
                url: req.url,
                requestId: req.id,
              }),
              res: (res) => ({
                statusCode: res.statusCode,
              }),
            },
          },
        };
      },
    }),
  ],
})
export class AppLoggerModule {}
