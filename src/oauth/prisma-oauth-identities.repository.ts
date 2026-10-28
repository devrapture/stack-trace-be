import { Injectable } from '@nestjs/common';
import { TransactionClient } from '../prisma/db.js';
import {
  isPostgresError,
  POSTGRES_UNIQUE_VIOLATION,
} from '../prisma/postgres-error.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  LinkedOAuthIdentity,
  OAuthIdentityAlreadyLinkedError,
  OAuthIdentitiesRepository,
  OAuthProviderAlreadyLinkedError,
} from './oauth-identities.repository.js';
import { OAuthProviderName } from './oauth-state.repository.js';

const USER_PROVIDER_UNIQUE_CONSTRAINT = 'auth_identities_user_id_provider_key';
const PROVIDER_SUBJECT_UNIQUE_CONSTRAINT =
  'auth_identities_provider_provider_subject_key';

const postgresConstraint = (error: unknown): string | undefined => {
  if (!(error instanceof Error)) return undefined;

  const postgresError = 'sqlState' in error ? error : error.cause;
  if (
    typeof postgresError !== 'object' ||
    postgresError === null ||
    !('constraint' in postgresError)
  )
    return undefined;

  return typeof postgresError.constraint === 'string'
    ? postgresError.constraint
    : undefined;
};

@Injectable()
export class PrismaOAuthIdentitiesRepository implements OAuthIdentitiesRepository {
  private readonly db: PrismaService['db']['orm']['public'];
  constructor(private readonly prisma: PrismaService) {
    this.db = prisma.db.orm.public;
  }
  async findUserIdByProviderSubject(
    provider: OAuthProviderName,
    providerSubject: string,
    tx?: TransactionClient,
  ): Promise<string | null> {
    const client = tx ?? this.prisma.db;
    const row = await client.orm.public.AuthIdentity.where({
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
    try {
      await client.orm.public.AuthIdentity.create({
        userId,
        provider,
        providerSubject,
      });
    } catch (error: unknown) {
      if (
        isPostgresError(error) &&
        ('sqlState' in error ? error.sqlState : error.cause.sqlState) ===
          POSTGRES_UNIQUE_VIOLATION
      ) {
        const constraint = postgresConstraint(error);
        if (constraint === USER_PROVIDER_UNIQUE_CONSTRAINT)
          throw new OAuthProviderAlreadyLinkedError();

        if (constraint === PROVIDER_SUBJECT_UNIQUE_CONSTRAINT)
          throw new OAuthIdentityAlreadyLinkedError();
      }

      throw error;
    }
  }

  async listForUser(
    userId: string,
    tx?: TransactionClient,
  ): Promise<LinkedOAuthIdentity[]> {
    const client = tx ?? this.prisma.db;
    const row = await client.orm.public.AuthIdentity.where({ userId })
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
