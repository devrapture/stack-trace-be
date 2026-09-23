import { randomUUID } from 'crypto';

export const REQUEST_ID_HEADER = 'x-request-id';

const SAFE_REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;

export type RequestIdGenerator = () => string;

export const isSafeRequestId = (value: unknown): value is string => {
  return typeof value === 'string' && SAFE_REQUEST_ID_PATTERN.test(value);
};

export const generateRequestId = (): string => `req_${randomUUID()}`;

export const resolveRequestId = (
  headerValue: unknown,
  generate: RequestIdGenerator = generateRequestId,
): string => {
  if (isSafeRequestId(headerValue)) return headerValue;
  return generate();
};
