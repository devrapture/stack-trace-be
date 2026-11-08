import { Inject, Injectable } from '@nestjs/common';
import { accountEmail } from '../../email/templates/account-email.js';
import { normalizeEmail } from '../../users/normalize-email.js';
import { UserProfile } from '../../users/user.model.js';
import {
  UserEmailAlreadyExistsError,
  USERS_REPOSITORY,
  type UsersRepository,
} from '../../users/users.repository.js';
import {
  EMAIL_VERIFICATION_REPOSITORY,
  type EmailVerificationChallengesRepository,
} from '../email-verification/email-verification.repository.js';
import {
  OTP_MAX_ATTEMPTS,
  OTP_RESEND_COOLDOWN_MS,
  OTP_TTL_MS,
  OtpService,
} from '../email-verification/otp.service.js';
import {
  PASSWORD_CREDENTIALS_REPOSITORY,
  type PasswordCredentialsRepository,
} from '../password/password-credentials.repository.js';
import { validatePassword } from '../password/password-policy.js';
import { PasswordHasher } from '../password/password.hasher.js';
import { RegisterDto, RegisterResponseDto } from './register.dto.js';
import { EMAIL_QUEUE, type EmailQueue } from '../../email/email-queue.js';
import { randomUUID } from 'crypto';

const GENERIC_RESPONSE: RegisterResponseDto = {
  message:
    'Registration successful. Please check your email for a verification code.',
};

@Injectable()
export class RegistrationService {
  constructor(
    @Inject(USERS_REPOSITORY)
    private readonly userService: UsersRepository,
    @Inject(PASSWORD_CREDENTIALS_REPOSITORY)
    private readonly passwordCredentialsRepository: PasswordCredentialsRepository,
    @Inject(EMAIL_VERIFICATION_REPOSITORY)
    private readonly emailVerificationRepository: EmailVerificationChallengesRepository,
    @Inject(EMAIL_QUEUE)
    private readonly emailQueue: EmailQueue,
    private readonly passwordHasher: PasswordHasher,
    private readonly otpService: OtpService,
  ) {}

  async register(dto: RegisterDto): Promise<RegisterResponseDto> {
    validatePassword(dto.password);
    const { displayEmail, normalizedEmail } = normalizeEmail(dto.email);

    const existing =
      await this.userService.getUserByNormalizedEmail(normalizedEmail);

    if (existing) {
      await this.handleExistingEmail(existing, dto.password);
      return GENERIC_RESPONSE;
    }

    const passwordHash = await this.passwordHasher.hash(dto.password);

    try {
      const user = await this.userService.createWithPrimaryEmailAndPassword({
        email: displayEmail,
        passwordHash,
      });

      await this.issueAndSendOtp(user.id, displayEmail);
    } catch (error) {
      if (error instanceof UserEmailAlreadyExistsError) {
        return GENERIC_RESPONSE;
      }
      throw error;
    }

    return GENERIC_RESPONSE;
  }

  private async handleExistingEmail(
    user: UserProfile,
    password: string,
  ): Promise<void> {
    const primaryEmail = user.primaryEmail;
    if (!primaryEmail) {
      return;
    }

    const existingHash =
      await this.passwordCredentialsRepository.findHashByUserId(user.id);

    if (existingHash && (user.status !== 'PENDING' || primaryEmail.verified)) {
      await this.emailQueue.enqueue({
        kind: 'existing_account_notice',
        userId: user.id,
        idempotencyKey: randomUUID(),
        critical: true,
        message: {
          to: primaryEmail.normalized,
          ...accountEmail({
            type: 'existing_account_notice',
          }),
        },
      });
      return;
    }

    if (existingHash) {
      const passwordHash = await this.passwordHasher.hash(password);
      await this.issueAndSendOtp(
        user.id,
        primaryEmail.normalized,
        passwordHash,
      );
      return;
    }

    await this.emailQueue.enqueue({
      kind: 'oauth_only_account_notice',
      userId: user.id,
      idempotencyKey: randomUUID(),
      critical: true,
      message: {
        to: primaryEmail.normalized,
        ...accountEmail({
          type: 'oauth_only_account_notice',
        }),
      },
    });
  }

  private async issueAndSendOtp(
    userId: string,
    toEmail: string,
    passwordHash?: string,
  ): Promise<void> {
    const otp = this.otpService.generate();
    const otpHash = this.otpService.hash(otp);

    const challengeId =
      await this.emailVerificationRepository.issueWithCooldown({
        userId,
        purpose: 'REGISTRATION',
        otpHash,
        ttlMs: OTP_TTL_MS,
        cooldownMs: OTP_RESEND_COOLDOWN_MS,
        maxAttempts: OTP_MAX_ATTEMPTS,
        passwordHash,
      });

    await this.emailQueue.enqueue({
      kind: 'registration_otp',
      challengeId,
      userId: userId,
      idempotencyKey: randomUUID(),
      critical: true,
      expiresAt: new Date(Date.now() + OTP_TTL_MS).toISOString(),
      message: {
        to: toEmail,
        ...accountEmail({
          type: 'registration_otp',
          otp,
          expiresInMinutes: OTP_TTL_MS / 60_000,
        }),
      },
    });
  }
}
