import { vi } from 'vitest';
import type { PrismaService } from '../../prisma/prisma.service.js';
import { PasswordIdentityAlreadyExistsError } from './password-credentials.repository.js';
import { PrismaPasswordCredentialsRepository } from './prisma-password-credentials.repository.js';

describe('PrismaPasswordCredentialsRepository.createForUser', () => {
  async function createWithError(error: unknown): Promise<void> {
    const prisma = {
      db: { transaction: vi.fn().mockRejectedValue(error) },
    } as unknown as PrismaService;
    const repository = new PrismaPasswordCredentialsRepository(prisma);
    await repository.createForUser('user-id', 'password-hash');
  }

  it.each([
    Object.assign(new Error('duplicate'), { sqlState: '23505' }),
    new Error('wrapped', { cause: { sqlState: '23505' } }),
    new Error('wrapped', {
      cause: Object.assign(new Error('duplicate'), { sqlState: '23505' }),
    }),
  ])('maps direct and wrapped unique violations: %j', async (error) => {
    await expect(createWithError(error)).rejects.toBeInstanceOf(
      PasswordIdentityAlreadyExistsError,
    );
  });

  it.each([
    new Error('unrelated'),
    new Error('wrapped', { cause: null }),
    new Error('wrapped', { cause: '23505' }),
    new Error('wrapped', { cause: { sqlState: 23505 } }),
    new Error('wrapped', { cause: { sqlState: '23503' } }),
    Object.assign(new Error('direct takes precedence'), {
      sqlState: '23503',
      cause: { sqlState: '23505' },
    }),
  ])('preserves other errors: %j', async (error) => {
    await expect(createWithError(error)).rejects.toBe(error);
  });
});
