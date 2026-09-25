import type { FieldOutputTypes } from '../prisma/contract.d';
import type { UserProfile } from './user.model.js';

type UserFields = FieldOutputTypes['public']['User'];
type EmailFields = FieldOutputTypes['public']['UserEmail'];

export type UserProfileSource = Pick<
  UserFields,
  | 'id'
  | 'publicId'
  | 'displayName'
  | 'role'
  | 'avatarUrl'
  | 'status'
  | 'lastLoginAt'
  | 'createdAt'
  | 'updatedAt'
> & {
  email: readonly Pick<
    EmailFields,
    'email' | 'normalizedEmail' | 'verifiedAt' | 'isPrimary'
  >[];
};

export function mapToUserProfile(user: UserProfileSource): UserProfile {
  const primaryEmail = user.email.find((email) => email.isPrimary);
  if (!primaryEmail) {
    throw new Error(`User ${user.id} has no primary email`);
  }
  return Object.freeze({
    id: user.id,
    publicId: user.publicId,
    displayName: user.displayName,
    role: user.role,
    avatarUrl: user.avatarUrl,
    status: user.status,
    primaryEmail: Object.freeze({
      display: primaryEmail.email,
      normalized: primaryEmail.normalizedEmail,
      verified: primaryEmail.verifiedAt !== null,
    }),
    lastLoginAt: user.lastLoginAt
      ? new Date(user.lastLoginAt.epochMilliseconds)
      : null,
    createdAt: new Date(user.createdAt.epochMilliseconds),
    updatedAt: new Date(user.updatedAt.epochMilliseconds),
  });
}
