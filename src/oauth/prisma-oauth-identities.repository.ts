import { Injectable } from '@nestjs/common';
import { TransactionClient } from '../prisma/db.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { OAuthIdentitiesRepository } from './oauth-identities.repository.js';
import { OAuthProviderName } from './oauth-state.repository.js';

@Injectable()
export class PrismaOAuthIdentitiesRepository implements OAuthIdentitiesRepository {
  private readonly db: PrismaService['db']['orm']['public'];
  constructor(private readonly prisma: PrismaService) {
    this.db = prisma.db.orm.public;
  }
  async findUserIdByProviderSubject(
    provider: OAuthProviderName,
    providerSubject: string,
  ): Promise<string | null> {
    const row = await this.db.AuthIdentity.where({
      provider,
      providerSubject,
    }).first();
    return row?.userId ?? null;
  }

  async createForUser(
    userId: string,
    provider: OAuthProviderName,
    providerSubject: string,
    tx?: TransactionClient,
  ): Promise<void> {
    const client = tx ?? this.prisma.db;
    await client.orm.public.AuthIdentity.create({
      userId,
      provider,
      providerSubject,
    });
  }
}
