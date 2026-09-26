import type { UserProfile } from './user.model.js';

export const USERS_REPOSITORY = Symbol('USERS_REPOSITORY');

export interface UsersRepository {
  getUserByNormalizedEmail(
    normalizedEmail: string,
  ): Promise<UserProfile | null>;
  getUserById(userId: string): Promise<UserProfile | null>;
  findByPublicId(publicId: string): Promise<UserProfile | null>;
  updateDisplayName(id: string, displayName: string): Promise<UserProfile>;
}
