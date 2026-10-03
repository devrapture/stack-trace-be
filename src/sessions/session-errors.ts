import { HttpStatus } from '@nestjs/common';
import { AppError } from '../common/error/app-error.js';
import { ErrorCode } from '../common/error/error-codes.js';

export class InvalidRefreshTokenError extends AppError {
  constructor() {
    super(
      ErrorCode.INVALID_REFRESH_TOKEN,
      'This refresh token is invalid or has expired.',
      HttpStatus.UNAUTHORIZED,
    );
    this.name = 'InvalidRefreshTokenError';
  }
}

export class RefreshTokenReuseDetectedError extends AppError {
  constructor() {
    super(
      ErrorCode.REFRESH_TOKEN_REUSE_DETECTED,
      'This session has been revoked due to suspicious activity.',
      HttpStatus.UNAUTHORIZED,
    );
    this.name = 'RefreshTokenReuseDetectedError';
  }
}
