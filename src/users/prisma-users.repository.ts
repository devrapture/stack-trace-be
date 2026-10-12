import { Injectable } from '@nestjs/common';
import { Temporal } from 'temporal-polyfill/full';
import type { FieldOutputTypes } from '../prisma/contract.d';
import { TransactionClient } from '../prisma/db';
import {
  isPostgresError,
  POSTGRES_UNIQUE_VIOLATION,
} from '../prisma/postgres-error.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { normalizeEmail } from './normalize-email.js';
import { mapToUserProfile } from './user-profile.mapper.js';
import type { NewUserWithEmail, UserProfile } from './user.model.js';
import {
  UserEmailAlreadyExistsError,
  type UsersRepository,
} from './users.repository.js';

type UserField = keyof FieldOutputTypes['public']['User'];
type EmailFields = keyof FieldOutputTypes['public']['UserEmail'];

const USER_SELECT = [
  'id',
  'publicId',
  'displayName',
  'avatarUrl',
  'status',
  'lastLoginAt',
  'role',
  'createdAt',
  'updatedAt',
] as const satisfies readonly UserField[];

const EMAIL_SELECT = [
  'email',
  'normalizedEmail',
  'verifiedAt',
  'isPrimary',
] as const satisfies readonly EmailFields[];

@Injectable()
export class PrismaUserRepository implements UsersRepository {
  constructor(private readonly prisma: PrismaService) {}
  async createWithPrimaryEmail(
    input: NewUserWithEmail,
    tx?: TransactionClient,
  ): Promise<UserProfile> {
    const { displayEmail, normalizedEmail } = normalizeEmail(input.email);
    const create = (client: TransactionClient | PrismaService['db']) =>
      client.orm.public.User.include('email').create({
        displayName: displayEmail,
        status: 'ACTIVE',
        email: (email) =>
          email.create([
            {
              email: displayEmail,
              normalizedEmail,
              isPrimary: true,
              verifiedAt: Temporal.Now.instant(),
            },
          ]),
      });

    try {
      const created = tx
        ? await create(tx)
        : await this.prisma.db.transaction(create);
      return mapToUserProfile(created);
    } catch (error) {
      if (
        isPostgresError(error) &&
        ('sqlState' in error ? error.sqlState : error.cause.sqlState) ===
          POSTGRES_UNIQUE_VIOLATION
      ) {
        throw new UserEmailAlreadyExistsError();
      }
      throw error;
    }
  }
  async createWithPrimaryEmailAndPassword(
    input: NewUserWithEmail & { passwordHash: string },
  ): Promise<UserProfile> {
    const { displayEmail, normalizedEmail } = normalizeEmail(input.email);

    try {
      return await this.prisma.db.transaction(async (tx) => {
        const user = await tx.orm.public.User.include('email').create({
          displayName: displayEmail,
          email: (email) =>
            email.create([
              {
                email: displayEmail,
                normalizedEmail,
                isPrimary: true,
              },
            ]),
        });

        const identity = await tx.orm.public.AuthIdentity.create({
          provider: 'PASSWORD',
          userId: user.id,
        });

        await tx.orm.public.PasswordCredential.create({
          authIdentityId: identity.id,
          passwordHash: input.passwordHash,
        });

        return mapToUserProfile(user);
      });
    } catch (error: unknown) {
      if (
        isPostgresError(error) &&
        ('sqlState' in error ? error.sqlState : error.cause.sqlState) ===
          POSTGRES_UNIQUE_VIOLATION
      ) {
        throw new UserEmailAlreadyExistsError();
      }
      throw error;
    }
  }
  async findByPublicId(publicId: string): Promise<UserProfile | null> {
    const user = await this.prisma.db.orm.public.User.where({ publicId })
      .select(...USER_SELECT)
      .include('email', (emails) =>
        emails.where({ isPrimary: true }).select(...EMAIL_SELECT),
      )
      .first();

    return user ? mapToUserProfile(user) : null;
  }

  async getUserById(userId: string): Promise<UserProfile | null> {
    const user = await this.prisma.db.orm.public.User.where({
      id: userId,
    })
      .select(...USER_SELECT)
      .include('email', (emails) =>
        emails.where({ isPrimary: true }).select(...EMAIL_SELECT),
      )
      .first();

    return user ? mapToUserProfile(user) : null;
  }

  async getUserByNormalizedEmail(
    normalizedEmail: string,
  ): Promise<UserProfile | null> {
    const emailRecord = await this.prisma.db.orm.public.UserEmail.where({
      normalizedEmail,
    })
      .include('user', (users) =>
        users
          .select(...USER_SELECT)
          .include('email', (emails) =>
            emails.where({ isPrimary: true }).select(...EMAIL_SELECT),
          ),
      )
      .first();

    return emailRecord?.user ? mapToUserProfile(emailRecord.user) : null;
  }

  async updateDisplayName(
    id: string,
    displayName: string,
  ): Promise<UserProfile> {
    const updated = await this.prisma.db.orm.public.User.where({ id }).update({
      displayName,
    });

    if (!updated) {
      throw new Error(`User ${id} not found`);
    }

    const profile = await this.getUserById(id);
    if (!profile) {
      throw new Error(`User ${id} not found after update`);
    }

    return profile;
  }
}
