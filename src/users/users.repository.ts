import { TransactionClient } from '../prisma/db.js';
import type { NewUserWithEmail, UserProfile } from './user.model.js';

export const USERS_REPOSITORY = Symbol('USERS_REPOSITORY');

export class UserEmailAlreadyExistsError extends Error {
  constructor() {
    super('A user with this email already exists.');
    this.name = 'UserEmailAlreadyExistsError';
    Error.captureStackTrace?.(this, UserEmailAlreadyExistsError);
  }
}

export interface UsersRepository {
  createWithPrimaryEmail(
    input: NewUserWithEmail,
    tx?: TransactionClient,
  ): Promise<UserProfile>;
  createWithPrimaryEmailAndPassword(
    input: NewUserWithEmail & { passwordHash: string },
  ): Promise<UserProfile>;
  getUserByNormalizedEmail(
    normalizedEmail: string,
  ): Promise<UserProfile | null>;
  getUserById(userId: string): Promise<UserProfile | null>;
  lockForUpdate(userId: string, tx: TransactionClient): Promise<void>;
  findByPublicId(publicId: string): Promise<UserProfile | null>;
  updateDisplayName(id: string, displayName: string): Promise<UserProfile>;
}
