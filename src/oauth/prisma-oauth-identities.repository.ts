import { Injectable } from '@nestjs/common';
import { TransactionClient } from '../prisma/db.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  LinkedOAuthIdentity,
  OAuthIdentitiesRepository,
} from './oauth-identities.repository.js';
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

  async listForUser(userId: string): Promise<LinkedOAuthIdentity[]> {
    const row = await this.db.AuthIdentity.where({ userId })
      .where((identity) => identity.provider.in(['GOOGLE', 'GITHUB']))
      .select('provider', 'providerSubject', 'createdAt')
      .all();
    return row.flatMap((r): LinkedOAuthIdentity[] => {
      if (r.provider === 'PASSWORD' || r.providerSubject === null) return [];

      return [
        {
          provider: r.provider,
          providerSubject: r.providerSubject,
          createdAt: new Date(r.createdAt.epochMilliseconds),
        },
      ];
    });
  }

  async deleteForUser(
    userId: string,
    provider: OAuthProviderName,
    tx?: TransactionClient,
  ): Promise<void> {
    const client = tx ?? this.prisma.db;
    await client.orm.public.AuthIdentity.where({
      userId,
      provider,
    }).deleteAll();
  }
}
