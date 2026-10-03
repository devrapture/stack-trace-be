export const ErrorCode = {
  INTERNAL: 'internal_error',
  BAD_REQUEST: 'bad_request',
  VALIDATION: 'validation_error',
  UNAUTHORIZED: 'unauthorized',
  FORBIDDEN: 'forbidden',
  NOT_FOUND: 'not_found',
  CONFLICT: 'conflict',
  RATE_LIMITED: 'rate_limited',
  ACCOUNT_LINK_REQUIRED: 'account_link_required',
  INVALID_CREDENTIALS: 'invalid_credentials',
  NOT_READY: 'not_ready',
  PASSWORD_POLICY_VALIDATION: 'password_policy_validation',
  TOO_MANY_REQUESTS: 'too_many_requests',
  INVALID_REFRESH_TOKEN: 'invalid_refresh_token',
  REFRESH_TOKEN_REUSE_DETECTED: 'refresh_token_reuse_detected',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];
