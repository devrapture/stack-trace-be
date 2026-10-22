import { Injectable } from '@nestjs/common';
import { Temporal } from 'temporal-polyfill/full';
import { TransactionClient } from '../prisma/db.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  ActiveOAuthLinkChallenge,
  OAuthLinkChallengeRepository,
} from './oauth-link-challenge.repository.js';
import { OAuthProviderName } from './oauth-state.repository.js';

@Injectable()
export class PrismaOAuthLinkChallengeRepository implements OAuthLinkChallengeRepository {
  private readonly db: PrismaService['db']['orm']['public'];

  constructor(private readonly prisma: PrismaService) {
    this.db = prisma.db.orm.public;
  }

  async create(input: {
    userId: string;
    provider: OAuthProviderName;
    providerSubject: string;
    otpHash: string;
    expiresAt: Date;
    maxAttempts: number;
  }): Promise<void> {
    const {
      userId,
      provider,
      providerSubject,
      otpHash,
      maxAttempts,
      expiresAt,
    } = input;
    await this.db.OAuthLinkChallenge.create({
      userId,
      provider,
      providerSubject,
      otpHash,
      maxAttempts,
      expiresAt: Temporal.Instant.fromEpochMilliseconds(expiresAt.getTime()),
    });
  }

  async findActiveForUser(
    userId: string,
  ): Promise<ActiveOAuthLinkChallenge | null> {
    const row = await this.db.OAuthLinkChallenge.where({
      userId,
      consumedAt: null,
    })
      .orderBy((u) => u.createdAt.desc())
      .first();

    return row
      ? {
          id: row.id,
          provider: row.provider,
          providerSubject: row.providerSubject,
          otpHash: row.otpHash,
          attemptCount: row.attemptCount,
          maxAttempts: row.maxAttempts,
          expiresAt: new Date(row.expiresAt.epochMilliseconds),
        }
      : null;
  }

  async incrementAttempts(challengeId: string): Promise<boolean> {
    const query = this.prisma.db.raw.sql`
      UPDATE oauth_link_challenges
      SET attempt_count = attempt_count + 1,
          updated_at = now()
      WHERE id = ${challengeId}
        AND consumed_at IS NULL
        AND expires_at > now()
        AND attempt_count < max_attempts
    `
      .affectedCount()
      .build();

    const { affectedRows } = await this.prisma.db.runtime().execute(query);
    return affectedRows > 0;
  }

  async markConsumed(
    challengeId: string,
    tx?: TransactionClient,
  ): Promise<boolean> {
    const query = this.prisma.db.raw.sql`
      UPDATE oauth_link_challenges
      SET consumed_at = clock_timestamp(),
          updated_at = now()
      WHERE id = ${challengeId}
        AND consumed_at IS NULL
        AND expires_at > now()
        AND attempt_count < max_attempts
    `
      .affectedCount()
      .build();
    if (tx) {
      const { affectedRows } = await tx.execute(query);
      return affectedRows > 0;
    }

    const { affectedRows } = await this.prisma.db.runtime().execute(query);
    return affectedRows > 0;
  }
}
