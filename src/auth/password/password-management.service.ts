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
  type EmailProvider,
} from '../../email/email-provider.js';
import { accountEmail } from '../../email/templates/account-email.js';
import { PrismaUnitOfWork } from '../../prisma/prisma-unit-of-work.js';
import { UNIT_OF_WORK } from '../../prisma/unit-of-work.js';
import {
  AUTH_SESSIONS_REPOSITORY,
  type AuthSessionsRepository,
} from '../../sessions/auth-sessions.repository.js';
import {
  USERS_REPOSITORY,
  type UsersRepository,
} from '../../users/users.repository.js';
import {
  ChangePasswordDto,
  ChangePasswordResponseDto,
} from '../dto/change-password.dto.js';
import {
  PASSWORD_CREDENTIALS_REPOSITORY,
  type PasswordCredentialsRepository,
} from './password-credentials.repository.js';
import { validatePassword } from './password-policy.js';
import { PasswordHasher } from './password.hasher.js';

@Injectable()
export class PasswordManagementService {
  constructor(
    @Inject(PASSWORD_CREDENTIALS_REPOSITORY)
    private readonly passwordCredentialsRepository: PasswordCredentialsRepository,
    @Inject(UNIT_OF_WORK)
    private readonly unitOfWork: PrismaUnitOfWork,
    @Inject(USERS_REPOSITORY)
    private userRepository: UsersRepository,
    @Inject(EMAIL_PROVIDER)
    private readonly emailProvider: EmailProvider,
    @Inject(AUTH_SESSIONS_REPOSITORY)
    private readonly sessionRepository: AuthSessionsRepository,
    @Inject(AUDIT_LOG_REPOSITORY)
    private readonly auditLogRepository: AuditLogRepository,
    private readonly passwordHasher: PasswordHasher,
    private readonly logger: PinoLogger,
  ) {}

  async changePassword(
    userId: string,
    currentSessionId: string,
    dto: ChangePasswordDto,
  ): Promise<ChangePasswordResponseDto> {
    const currentPasswordHash =
      await this.passwordCredentialsRepository.findHashByUserId(userId);
    if (!currentPasswordHash)
      throw new AppError(
        ErrorCode.NO_PASSWORD_IDENTITY,
        'There is no password for this user',
        HttpStatus.BAD_REQUEST,
      );

    const isCurrentPasswordCorrect = await this.passwordHasher.verify(
      currentPasswordHash,
      dto.currentPassword,
    );

    if (!isCurrentPasswordCorrect)
      throw new AppError(
        ErrorCode.INVALID_CREDENTIALS,
        'Invalid password',
        HttpStatus.BAD_REQUEST,
      );

    const isPasswordNew = await this.passwordHasher.verify(
      currentPasswordHash,
      dto.newPassword,
    );

    if (isPasswordNew)
      throw new AppError(
        ErrorCode.PASSWORD_REUSE,
        'The new password has to be different from the current password',
        HttpStatus.BAD_REQUEST,
      );

    validatePassword(dto.newPassword);

    const newPasswordHash = await this.passwordHasher.hash(dto.newPassword);

    await this.unitOfWork.run(async (tx) => {
      const passwordUpdated =
        await this.passwordCredentialsRepository.updateHashForUserIfCurrent(
          userId,
          currentPasswordHash,
          newPasswordHash,
          tx,
        );

      if (!passwordUpdated) {
        throw new AppError(
          ErrorCode.CONFLICT,
          'Your password was changed by another request. Please sign in again.',
          HttpStatus.CONFLICT,
        );
      }

      await this.sessionRepository.revokeAllForUser(
        userId,
        'PASSWORD_CHANGE',
        currentSessionId,
        tx,
      );

      await this.auditLogRepository.record(
        {
          userId,
          eventType: 'PASSWORD_CHANGED',
        },
        tx,
      );
    });

    try {
      const user = await this.userRepository.getUserById(userId);

      if (user?.primaryEmail) {
        await this.emailProvider.send({
          to: user.primaryEmail.display,
          ...accountEmail({
            type: 'password_changed',
          }),
        });
      }
    } catch (error) {
      this.logger.error(
        { error, userId },
        'Failed to send password change notification',
      );
    }

    this.logger.warn(
      `Audit: password changed for user ${userId}; other sessions revoked.`,
    );

    return {
      message:
        'Password changed. You have been signed out on every other device.',
    };
  }
}
