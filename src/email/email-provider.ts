export const EMAIL_TRANSPORT = Symbol('EMAIL_TRANSPORT');

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
  idempotencyKey?: string;
}

export interface EmailSendResult {
  provider: 'resend';
  messageId: string;
}

export interface EmailTransport {
  send(message: EmailMessage, signal?: AbortSignal): Promise<EmailSendResult>;
}
