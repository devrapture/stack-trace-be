import { HttpStatus, Injectable } from '@nestjs/common';
import { Temporal } from 'temporal-polyfill/full';
import { AppError } from '../../common/error/app-error.js';
import { ErrorCode } from '../../common/error/error-codes.js';
import { TransactionClient } from '../../prisma/db.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  ActivePasswordResetChallenge,
  PasswordResetChallengesRepository,
} from './password-reset.repository.js';

@Injectable()
export class PrismaPasswordRepository implements PasswordResetChallengesRepository {
  private readonly db: PrismaService['db']['orm']['public'];
  constructor(private prisma: PrismaService) {
    this.db = prisma.db.orm.public;
  }

  async claimNoticeCooldown(
    userId: string,
    cooldownMs: number,
  ): Promise<boolean> {
    const query = this.prisma.db.raw.sql`
      UPDATE users
      SET password_recovery_notice_sent_at = clock_timestamp()
      WHERE id = ${userId}
        AND (
          password_recovery_notice_sent_at IS NULL
          OR password_recovery_notice_sent_at <=
            clock_timestamp() - (${cooldownMs} * interval '1 millisecond')
        )
      RETURNING id
    `
      .returnsRow({ id: 'pg/uuid@1' })
      .build();

    for await (const _row of this.prisma.db.runtime().query(query)) {
      return true;
    }
    return false;
  }

  async invalidateActiveAndCreate(input: {
    userId: string;
    otpHash: string;
    expiresAt: Date;
    maxAttempts: number;
    cooldownMs: number;
  }): Promise<string> {
    const db = this.prisma.db;

    const lockUser = db.raw.sql`
    SELECT id FROM users WHERE id = ${input.userId} FOR UPDATE
    `
      .returnsRow({ id: 'pg/uuid@1' })
      .build();
    return db.transaction(async (tx) => {
      let userFound = false;
      for await (const _row of tx.query(lockUser)) {
        userFound = true;
      }
      if (!userFound)
        throw new AppError(
          ErrorCode.NOT_FOUND,
          'user not found',
          HttpStatus.NOT_FOUND,
        );

      const now = Temporal.Now.instant();
      const mostRecentChallenge =
        await tx.orm.public.PasswordResetChallenge.where({
          userId: input.userId,
        })
          .orderBy((challenge) => challenge.createdAt.desc())
          .first();

      if (
        mostRecentChallenge &&
        now.epochMilliseconds -
          mostRecentChallenge.createdAt.epochMilliseconds <
          input.cooldownMs
      ) {
        throw new AppError(
          ErrorCode.TOO_MANY_REQUESTS,
          'Please wait before requesting another code.',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      await tx.orm.public.PasswordResetChallenge.where({
        userId: input.userId,
        consumedAt: null,
      }).updateAll({
        consumedAt: now,
      });

      const challenge = await tx.orm.public.PasswordResetChallenge.create({
        userId: input.userId,
        expiresAt: Temporal.Instant.fromEpochMilliseconds(
          input.expiresAt.getTime(),
        ),
        otpHash: input.otpHash,
        maxAttempts: input.maxAttempts,
        attemptCount: 0,
      });
      return challenge.id;
    });
  }

  async claimAttempt(
    userId: string,
  ): Promise<ActivePasswordResetChallenge | null> {
    const query = this.prisma.db.raw.sql`
      UPDATE password_reset_challenge AS challenge
      SET attempt_count = challenge.attempt_count + 1,
          updated_at = clock_timestamp()
      WHERE challenge.id = (
        SELECT candidate.id
        FROM password_reset_challenge AS candidate
        WHERE candidate.user_id = ${userId}
          AND candidate.consumed_at IS NULL
        ORDER BY candidate.created_at DESC
        LIMIT 1
      )
        AND challenge.consumed_at IS NULL
        AND challenge.expires_at > clock_timestamp()
        AND challenge.attempt_count < challenge.max_attempts
      RETURNING challenge.id,
                challenge.otp_hash AS "otpHash",
                challenge.expires_at AS "expiresAt",
                challenge.attempt_count AS "attemptCount",
                challenge.max_attempts AS "maxAttempts"
    `
      .returnsRow({
        id: 'pg/uuid@1',
        otpHash: 'pg/text@1',
        expiresAt: 'pg/timestamptz-temporal@1',
        attemptCount: 'pg/int4@1',
        maxAttempts: 'pg/int4@1',
      })
      .build();

    for await (const row of this.prisma.db.runtime().query(query)) {
      return {
        id: row.id,
        otpHash: row.otpHash,
        expiresAt: new Date(row.expiresAt.epochMilliseconds),
        attemptCount: row.attemptCount,
        maxAttempts: row.maxAttempts,
      };
    }
    return null;
  }

  async mostRecentIssuedAt(userId: string): Promise<Date | null> {
    const row = await this.db.PasswordResetChallenge.where({
      userId,
    })
      .orderBy((s) => s.createdAt.desc())
      .first();

    return row ? new Date(row.createdAt.epochMilliseconds) : null;
  }

  async consumeIfActive(
    challengeId: string,
    tx: TransactionClient,
  ): Promise<boolean> {
    const query = this.prisma.db.raw.sql`
      UPDATE password_reset_challenge
      SET consumed_at = clock_timestamp(),
          updated_at = clock_timestamp()
      WHERE id = ${challengeId}
        AND consumed_at IS NULL
        AND expires_at > clock_timestamp()
        AND attempt_count > 0
        AND attempt_count <= max_attempts
      RETURNING id
    `
      .returnsRow({ id: 'pg/uuid@1' })
      .build();

    for await (const _row of tx.query(query)) {
      return true;
    }
    return false;
  }
}
