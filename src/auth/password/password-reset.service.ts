import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import {
  AUDIT_LOG_REPOSITORY,
  type AuditLogRepository,
} from '../../audit/audit-log.repository.js';
import { AppError } from '../../common/error/app-error.js';
import { ErrorCode } from '../../common/error/error-codes.js';
import {
  EMAIL_PROVIDER,
  type EmailMessage,
  type EmailProvider,
} from '../../email/email-provider.js';
import { accountEmail } from '../../email/templates/account-email.js';
import { PrismaUnitOfWork } from '../../prisma/prisma-unit-of-work.js';
import { UNIT_OF_WORK } from '../../prisma/unit-of-work.js';
import {
  AUTH_SESSIONS_REPOSITORY,
  type AuthSessionsRepository,
} from '../../sessions/auth-sessions.repository.js';
import { normalizeEmail } from '../../users/normalize-email.js';
import {
  USERS_REPOSITORY,
  type UsersRepository,
} from '../../users/users.repository.js';
import {
  ForgotPasswordDto,
  ForgotPasswordResponseDto,
} from '../dto/forgot-password.dto.js';
import {
  ResetPasswordDto,
  ResetPasswordResponseDto,
} from '../dto/reset-password.dto.js';
import {
  OTP_MAX_ATTEMPTS,
  OTP_RESEND_COOLDOWN_MS,
  OTP_TTL_MS,
  OtpService,
} from '../email-verification/otp.service.js';
import {
  PASSWORD_CREDENTIALS_REPOSITORY,
  type PasswordCredentialsRepository,
} from './password-credentials.repository.js';
import {
  PASSWORD_RESET_REPOSITORY,
  type PasswordResetChallengesRepository,
} from './password-reset.repository.js';
import { PasswordHasher } from './password.hasher.js';

const GENERIC_FORGOT_RESPONSE: ForgotPasswordResponseDto = {
  message:
    'If an account with this email can reset its password, instructions have been sent.',
};

@Injectable()
export class PasswordResetService {
  constructor(
    @Inject(USERS_REPOSITORY)
    private readonly userRepository: UsersRepository,
    @Inject(PASSWORD_CREDENTIALS_REPOSITORY)
    private readonly passwordCredentialsRepository: PasswordCredentialsRepository,
    @Inject(EMAIL_PROVIDER)
    private readonly emailProvider: EmailProvider,
    @Inject(PASSWORD_RESET_REPOSITORY)
    private readonly passwordResetChallenge: PasswordResetChallengesRepository,
    @Inject(UNIT_OF_WORK)
    private readonly unitOfWork: PrismaUnitOfWork,
    @Inject(AUTH_SESSIONS_REPOSITORY)
    private readonly sessionRepository: AuthSessionsRepository,
    @Inject(AUDIT_LOG_REPOSITORY)
    private readonly auditLogRepository: AuditLogRepository,
    private readonly logger: PinoLogger,
    private readonly otpService: OtpService,
    private readonly passwordHasher: PasswordHasher,
  ) {}

  async forgotPassword(
    dto: ForgotPasswordDto,
  ): Promise<ForgotPasswordResponseDto> {
    const { normalizedEmail, displayEmail } = normalizeEmail(dto.email);
    const user =
      await this.userRepository.getUserByNormalizedEmail(normalizedEmail);
    if (!user) return GENERIC_FORGOT_RESPONSE;

    if (user.status === 'DELETED' || user.status === 'SUSPENDED')
      return GENERIC_FORGOT_RESPONSE;

    if (!user.primaryEmail?.verified || user.status === 'PENDING') {
      const canSend = await this.passwordResetChallenge.claimNoticeCooldown(
        user.id,
        OTP_RESEND_COOLDOWN_MS,
      );
      if (!canSend) return GENERIC_FORGOT_RESPONSE;

      await this.sendRecoveryEmailBestEffort(
        user.id,
        'unverified_account_password_reset_notice',
        {
          to: displayEmail,
          ...accountEmail({
            type: 'unverified_account_password_reset_notice',
          }),
        },
      );
      return GENERIC_FORGOT_RESPONSE;
    }

    const passwordHash =
      await this.passwordCredentialsRepository.findHashByUserId(user.id);

    if (!passwordHash) {
      const canSend = await this.passwordResetChallenge.claimNoticeCooldown(
        user.id,
        OTP_RESEND_COOLDOWN_MS,
      );
      if (!canSend) return GENERIC_FORGOT_RESPONSE;

      await this.sendRecoveryEmailBestEffort(
        user.id,
        'oauth_only_account_notice',
        {
          to: displayEmail,
          ...accountEmail({
            type: 'oauth_only_account_notice',
          }),
        },
      );
      return GENERIC_FORGOT_RESPONSE;
    }

    try {
      await this.issueAndSendResetOtp(user.id, displayEmail);
    } catch (error) {
      if (
        error instanceof AppError &&
        error.code === ErrorCode.TOO_MANY_REQUESTS
      ) {
        return GENERIC_FORGOT_RESPONSE;
      }

      throw error;
    }

    return GENERIC_FORGOT_RESPONSE;
  }

  async resetPassword(
    dto: ResetPasswordDto,
  ): Promise<ResetPasswordResponseDto> {
    const invalidCode = () =>
      new AppError(
        ErrorCode.BAD_REQUEST,
        'That code is invalid or has expired. Request a new one',
        HttpStatus.BAD_REQUEST,
      );
    const { normalizedEmail, displayEmail } = normalizeEmail(dto.email);
    const user =
      await this.userRepository.getUserByNormalizedEmail(normalizedEmail);

    if (!user) throw invalidCode();

    const challenge = await this.passwordResetChallenge.claimAttempt(user.id);

    if (!challenge) throw invalidCode();

    const isOtpCorrect = this.otpService.verify(dto.otp, challenge.otpHash);

    if (!isOtpCorrect) throw invalidCode();

    const passwordHash = await this.passwordHasher.hash(dto.newPassword);

    await this.unitOfWork.run(async (tx) => {
      await this.userRepository.lockForUpdate(user.id, tx);

      const consumed = await this.passwordResetChallenge.consumeIfActive(
        challenge.id,
        tx,
      );
      if (!consumed) throw invalidCode();

      await this.passwordCredentialsRepository.updateHashForUser(
        user.id,
        passwordHash,
        tx,
      );
      await this.sessionRepository.revokeAllForUser(
        user.id,
        'PASSWORD_CHANGE',
        undefined,
        tx,
      );

      await this.auditLogRepository.record(
        {
          userId: user.id,
          eventType: 'PASSWORD_RESET',
        },
        tx,
      );
    });

    try {
      await this.emailProvider.send({
        to: displayEmail,
        ...accountEmail({
          type: 'password_changed',
        }),
      });
    } catch (error) {
      this.logger.error(
        {
          err: error,
          userId: user.id,
          notification: 'password_changed',
        },
        'Password reset succeeded, but the notification email failed',
      );
    }

    return {
      message:
        'Your password has been reset. You have been signed out on every other device.',
    };
  }

  private async issueAndSendResetOtp(
    userId: string,
    toEmail: string,
  ): Promise<void> {
    const lastIssuedAt =
      await this.passwordResetChallenge.mostRecentIssuedAt(userId);
    if (lastIssuedAt) {
      const elaspedTime = Date.now() - lastIssuedAt.getTime();
      if (elaspedTime < OTP_RESEND_COOLDOWN_MS)
        throw new AppError(
          ErrorCode.TOO_MANY_REQUESTS,
          `Please wait before requesting another code.`,
          HttpStatus.TOO_MANY_REQUESTS,
        );
    }

    const otp = this.otpService.generate();
    const otpHash = this.otpService.hash(otp);

    await this.passwordResetChallenge.invalidateActiveAndCreate({
      userId,
      otpHash,
      expiresAt: new Date(Date.now() + OTP_TTL_MS),
      maxAttempts: OTP_MAX_ATTEMPTS,
      cooldownMs: OTP_RESEND_COOLDOWN_MS,
    });

    await this.sendRecoveryEmailBestEffort(userId, 'password_reset_otp', {
      to: toEmail,
      ...accountEmail({
        type: 'password_reset_otp',
        otp,
        expiresInMinutes: OTP_TTL_MS / 60000,
      }),
    });
  }

  private async sendRecoveryEmailBestEffort(
    userId: string,
    notification: string,
    message: EmailMessage,
  ): Promise<void> {
    try {
      await this.emailProvider.send(message);
    } catch (error) {
      this.logger.error(
        {
          userId,
          notification,
          errorName: error instanceof Error ? error.name : 'UnknownError',
        },
        'Recovery email delivery failed',
      );
    }
  }
}
