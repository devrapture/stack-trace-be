import { Injectable } from '@nestjs/common';
import { Temporal } from 'temporal-polyfill/full';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  CreateOAuthStateInput,
  OAuthStateRecord,
  OAuthStateRepository,
} from './oauth-state.repository.js';

@Injectable()
export class PrismaOAuthStateRepository implements OAuthStateRepository {
  private readonly db: PrismaService['db']['orm']['public'];
  constructor(private readonly prisma: PrismaService) {
    this.db = prisma.db.orm.public;
  }

  async create(input: CreateOAuthStateInput): Promise<void> {
    await this.db.OAuthState.create({
      provider: input.provider,
      intent: input.intent,
      state: input.state,
      nonce: input.nonce,
      pkceVerifier: input.pkceVerifier,
      redirectUri: input.redirectUri,
      clientType: input.clientType,
      linkingUserId: input.linkingUserId,
      linkingSessionId: input.linkingSessionId,
      expiresAt: Temporal.Instant.fromEpochMilliseconds(
        input.expiresAt.getTime(),
      ),
    });
  }

  async consume(state: string): Promise<OAuthStateRecord | null> {
    const count = await this.db.OAuthState.where({
      state,
      consumedAt: null,
    }).updateAndCount({
      consumedAt: Temporal.Now.instant(),
    });

    if (count === 0) return null;

    const row = await this.prisma.db.orm.public.OAuthState.where({
      state,
    }).first();

    return row
      ? {
          id: row.id,
          provider: row.provider,
          intent: row.intent,
          nonce: row.nonce,
          pkceVerifier: row.pkceVerifier,
          redirectUri: row.redirectUri,
          clientType: row.clientType,
          linkingUserId: row.linkingUserId,
          linkingSessionId: row.linkingSessionId,
          expiresAt: new Date(row.expiresAt.epochMilliseconds),
          consumedAt: row.consumedAt
            ? new Date(row.consumedAt.epochMilliseconds)
            : null,
        }
      : null;
  }

  async deleteExpired(before: Date): Promise<number> {
    const cutoff = Temporal.Instant.fromEpochMilliseconds(before.getTime());
    return this.db.OAuthState.where((oauthState) =>
      oauthState.expiresAt.lt(cutoff),
    ).deleteAndCount();
  }
}
