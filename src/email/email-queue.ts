import { EmailMessage } from './email-provider';
import { AccountEmailOptions } from './templates/account-email';

export const EMAIL_QUEUE = Symbol('EMAIL_QUEUE');

export type EmailKind = AccountEmailOptions['type'];
type OtpEmailKind = Extract<EmailKind, `${string}_otp`>;

interface EmailJobBase {
  readonly idempotencyKey: string;
  readonly kind: EmailKind;
  readonly userId?: string;
  readonly critical: boolean;
  readonly message: Omit<EmailMessage, 'idempotencyKey'>;
}

export type EnqueueEmailInput = EmailJobBase &
  (
    | {
        readonly kind: OtpEmailKind;
        readonly userId: string;
        readonly challengeId: string;
        readonly expiresAt: string;
      }
    | {
        readonly kind: Exclude<EmailKind, OtpEmailKind>;
        readonly challengeId?: never;
        readonly expiresAt?: never;
      }
  );

export interface EnqueueEmailResult {
  readonly jobId: string;
}

export interface EmailQueue {
  enqueue(input: EnqueueEmailInput): Promise<EnqueueEmailResult>;
}
