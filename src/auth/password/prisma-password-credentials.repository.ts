import { Injectable } from '@nestjs/common';
import { TransactionClient } from '../../prisma/db.js';
import {
  isPostgresError,
  POSTGRES_UNIQUE_VIOLATION,
} from '../../prisma/postgres-error.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  PasswordCredentialsRepository,
  PasswordIdentityAlreadyExistsError,
} from './password-credentials.repository.js';

@Injectable()
export class PrismaPasswordCredentialsRepository implements PasswordCredentialsRepository {
  constructor(private readonly prisma: PrismaService) {}
  async createForUser(userId: string, passwordHash: string): Promise<void> {
    try {
      await this.prisma.db.transaction(async (tx) => {
        const identity = await tx.orm.public.AuthIdentity.create({
          provider: 'PASSWORD',
          userId,
        });
        await tx.orm.public.PasswordCredential.create({
          authIdentityId: identity.id,
          passwordHash,
        });
      });
    } catch (error: unknown) {
      if (
        isPostgresError(error) &&
        ('sqlState' in error ? error.sqlState : error.cause.sqlState) ===
          POSTGRES_UNIQUE_VIOLATION
      ) {
        throw new PasswordIdentityAlreadyExistsError();
      }
      throw error;
    }
  }

  async updateHashForUser(
    userId: string,
    passwordHash: string,
    tx: TransactionClient,
  ): Promise<void> {
    // Overwrite the password hash when resuming an unverified registration so the latest submitted password is used.
    const client = tx ?? this.prisma.db;
    const identity = await client.orm.public.AuthIdentity.where({
      userId,
      provider: 'PASSWORD',
    })
      .include('passwordCredential')
      .first();

    if (!identity) {
      throw new Error('No password identity found for user.');
    }

    await client.orm.public.PasswordCredential.where({
      authIdentityId: identity.id,
    }).update({
      passwordHash,
    });
  }

  async updateHashForUserIfCurrent(
    userId: string,
    expectedPasswordHash: string,
    newPasswordHash: string,
    tx: TransactionClient,
  ): Promise<boolean> {
    const identity = await tx.orm.public.AuthIdentity.where({
      userId,
      provider: 'PASSWORD',
    }).first();

    if (!identity) {
      return false;
    }

    const updated = await tx.orm.public.PasswordCredential.where({
      authIdentityId: identity.id,
      passwordHash: expectedPasswordHash,
    }).update({
      passwordHash: newPasswordHash,
    });

    return updated !== null;
  }

  async findHashByUserId(
    userId: string,
    tx?: TransactionClient,
  ): Promise<string | null> {
    const client = tx ?? this.prisma.db;
    const identity = await client.orm.public.AuthIdentity.where({
      userId,
      provider: 'PASSWORD',
    })
      .include('passwordCredential')
      .first();

    return identity?.passwordCredential?.passwordHash ?? null;
  }
}
