import { Injectable } from '@nestjs/common';
import type { FieldOutputTypes } from '../prisma/contract.d';
import { PrismaService } from '../prisma/prisma.service.js';
import { mapToUserProfile } from './user-profile.mapper.js';
import type { UserProfile } from './user.model.js';
import type { UsersRepository } from './users.repository.js';

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

  async findByPublicId(publicId: string): Promise<UserProfile | null> {
    const user = await this.prisma.db.orm.public.User.where({ publicId })
      .select(...USER_SELECT)
      .include('email', (emails) =>
        emails
          .where({ isPrimary: true })
          .select(...EMAIL_SELECT)
          .limit(1),
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
        emails
          .where({ isPrimary: true })
          .select(...EMAIL_SELECT)
          .limit(1),
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
        users.select(...USER_SELECT).include('email', (emails) =>
          emails
            .where({ isPrimary: true })
            .select(...EMAIL_SELECT)
            .limit(1),
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
