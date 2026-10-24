import { vi } from 'vitest';
import type { TransactionClient } from '../prisma/db.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import {
  OAuthIdentityAlreadyLinkedError,
  OAuthProviderAlreadyLinkedError,
} from './oauth-identities.repository.js';
import { PrismaOAuthIdentitiesRepository } from './prisma-oauth-identities.repository.js';

describe('PrismaOAuthIdentitiesRepository.createForUser', () => {
  const createRepository = (error: unknown) => {
    const create = vi.fn().mockRejectedValue(error);
    const db = {
      orm: { public: { AuthIdentity: { create } } },
    } as unknown as PrismaService['db'];
    const repository = new PrismaOAuthIdentitiesRepository({
      db,
    } as PrismaService);

    return { create, db, repository };
  };

  it.each([
    ['auth_identities_user_id_provider_key', OAuthProviderAlreadyLinkedError],
    [
      'auth_identities_provider_provider_subject_key',
      OAuthIdentityAlreadyLinkedError,
    ],
  ])(
    'maps unique constraint %s to its domain conflict',
    async (constraint, ExpectedError) => {
      const databaseError = Object.assign(new Error('duplicate identity'), {
        sqlState: '23505',
        constraint,
      });
      const { repository, db } = createRepository(databaseError);

      await expect(
        repository.createForUser(
          'user-id',
          'GOOGLE',
          'google-subject',
          db as unknown as TransactionClient,
        ),
      ).rejects.toBeInstanceOf(ExpectedError);
    },
  );

  it('maps a wrapped unique-constraint violation', async () => {
    const databaseError = new Error('transaction failed', {
      cause: Object.assign(new Error('duplicate identity'), {
        sqlState: '23505',
        constraint: 'auth_identities_user_id_provider_key',
      }),
    });
    const { repository, db } = createRepository(databaseError);

    await expect(
      repository.createForUser(
        'user-id',
        'GOOGLE',
        'google-subject',
        db as unknown as TransactionClient,
      ),
    ).rejects.toBeInstanceOf(OAuthProviderAlreadyLinkedError);
  });

  it.each([
    Object.assign(new Error('foreign key violation'), {
      sqlState: '23503',
      constraint: 'auth_identities_user_id_fkey',
    }),
    Object.assign(new Error('unknown unique violation'), {
      sqlState: '23505',
      constraint: 'some_other_constraint',
    }),
  ])('preserves unrelated database errors', async (databaseError) => {
    const { repository, db } = createRepository(databaseError);

    await expect(
      repository.createForUser(
        'user-id',
        'GOOGLE',
        'google-subject',
        db as unknown as TransactionClient,
      ),
    ).rejects.toBe(databaseError);
  });
});
