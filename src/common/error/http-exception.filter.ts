import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { Logger } from 'nestjs-pino';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  constructor(private readonly logger: Logger) {}
  catch(exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<FastifyReply>();
    const request = ctx.getRequest<FastifyRequest>();
    const requestId = request.id ?? 'unavailable';
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    this.logger.error(
      {
        requestId,
        method: request.method,
        url: request.originalUrl,
        status,
        errorName: exception instanceof Error ? exception.name : 'UnknownError',
        errorMessage:
          exception instanceof Error ? exception.message : String(exception),
      },
      'request_failed',
    );

    if (response.raw.headersSent || response.raw.writableEnded) return;

    const publicMessage = this.publicMessage(status, exception);

    response.status(status).send({
      statusCode: status,
      error: HttpStatus[status] ?? 'Error',
      message: publicMessage,
    });
  }

  private publicMessage(status: number, exception: unknown): string | string[] {
    if (exception instanceof HttpException && status < 500) {
      const body = exception.getResponse();
      if (typeof body === 'string') return body;

      if (typeof body === 'object' && body !== null && 'message' in body) {
        const message = (body as { message: unknown }).message;
        if (typeof message === 'string' || Array.isArray(message)) {
          return message as string | string[];
        }
      }
    }
    return 'The request could not be completed';
  }
}
