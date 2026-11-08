import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { Resend } from 'resend';
import { AppError } from '../common/error/app-error.js';
import { ErrorCode } from '../common/error/error-codes.js';
import { APP_CONFIG, type AppConfig } from '../config/app-config.js';
import {
  EmailMessage,
  EmailTransport,
  EmailSendResult,
} from './email-provider.js';

@Injectable()
export class ResendEmailTransport implements EmailTransport {
  private readonly resend: Resend;
  private readonly fromHeader: string;
  constructor(
    @Inject(APP_CONFIG)
    private readonly config: AppConfig,
    private readonly logger: PinoLogger,
  ) {
    this.resend = new Resend(config.resendAPIKey);
    this.fromHeader = `${config.resendFromName} <${config.resendFromEmail}>`;
  }

  async send(
    message: EmailMessage,
    signal?: AbortSignal,
  ): Promise<EmailSendResult> {
    // Bail out immediately if the caller already cancelled before we started.
    signal?.throwIfAborted();

    const sendPromise = this.resend.emails.send(
      {
        from: this.fromHeader,
        to: message.to,
        subject: message.subject,
        text: message.text,
        html: message.html,
      },
      message.idempotencyKey
        ? { idempotencyKey: message.idempotencyKey }
        : undefined,
    );

    const { data, error } = signal
      ? await Promise.race([sendPromise, this.rejectOnAbort(signal)])
      : await sendPromise;

    if (error || !data) {
      this.logger.error(
        error
          ? `Resend delivery failed: ${error.name} — ${error.message}`
          : 'Resend delivery failed: SDK returned no data and no error',
      );
      throw new AppError(
        ErrorCode.INTERNAL,
        'Failed to send email',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    return {
      provider: 'resend',
      messageId: data?.id,
    };
  }

  private rejectOnAbort(signal: AbortSignal): Promise<never> {
    return new Promise((_, reject) => {
      if (signal.aborted) {
        reject(
          new DOMException(
            signal.reason?.toString() ?? 'Aborted',
            'AbortError',
          ),
        );
        return;
      }
      signal.addEventListener(
        'abort',
        () =>
          reject(
            new DOMException(
              signal.reason?.toString() ?? 'Aborted',
              'AbortError',
            ),
          ),
        { once: true },
      );
    });
  }
}
