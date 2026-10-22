import { Temporal } from 'temporal-polyfill/full';
import { vi } from 'vitest';
import type { PrismaService } from '../prisma/prisma.service.js';
import { PrismaUserRepository } from './prisma-users.repository.js';
import { UserEmailAlreadyExistsError } from './users.repository.js';

const NOW = Temporal.Instant.from('2026-10-12T06:45:00Z');

describe('PrismaUserRepository.createWithPrimaryEmail', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('creates an active user with a Temporal verified-email timestamp', async () => {
    vi.spyOn(Temporal.Now, 'instant').mockReturnValue(NOW);
    const createEmail = vi.fn();
    const createError = new Error('stop after capturing input');
    const createUser = vi.fn().mockImplementation((input) => {
      input.email({ create: createEmail });
      throw createError;
    });
    const tx = {
      orm: {
        public: {
          User: {
            include: vi.fn().mockReturnValue({ create: createUser }),
          },
        },
      },
    };
    const repository = new PrismaUserRepository({} as PrismaService);

    await expect(
      repository.createWithPrimaryEmail(
        { email: 'Person@Example.com' },
        tx as never,
      ),
    ).rejects.toBe(createError);

    expect(createUser).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'ACTIVE' }),
    );
    expect(createEmail).toHaveBeenCalledWith([
      expect.objectContaining({
        verifiedAt: NOW,
      }),
    ]);
  });
});

describe('PrismaUserRepository.createWithPrimaryEmailAndPassword', () => {
  async function createWithError(error: unknown): Promise<void> {
    const tx = {
      orm: {
        public: {
          User: {
            include: vi.fn().mockReturnValue({
              create: vi.fn().mockRejectedValue(error),
            }),
          },
        },
      },
    };
    const prisma = {
      db: {
        transaction: vi
          .fn()
          .mockImplementation(
            async (callback: (transaction: typeof tx) => Promise<unknown>) =>
              callback(tx),
          ),
      },
    } as unknown as PrismaService;

    const repository = new PrismaUserRepository(prisma);
    await repository.createWithPrimaryEmailAndPassword({
      email: 'Person@Example.com',
      passwordHash: 'password-hash',
    });
  }

  it.each([
    Object.assign(new Error('duplicate'), { sqlState: '23505' }),
    new Error('wrapped', { cause: { sqlState: '23505' } }),
  ])('maps direct and wrapped unique violations: %j', async (error) => {
    await expect(createWithError(error)).rejects.toBeInstanceOf(
      UserEmailAlreadyExistsError,
    );
  });

  it.each([
    new Error('unrelated'),
    new Error('wrapped', { cause: { sqlState: '23503' } }),
    Object.assign(new Error('direct state takes precedence'), {
      sqlState: '23503',
      cause: { sqlState: '23505' },
    }),
  ])('preserves other errors: %j', async (error) => {
    await expect(createWithError(error)).rejects.toBe(error);
  });
});

describe('PrismaUserRepository.lockForUpdate', () => {
  it('locks the user row on the supplied transaction', async () => {
    const lockQuery = {};
    const sql = vi.fn().mockReturnValue({
      returnsRow: vi.fn().mockReturnValue({
        build: vi.fn().mockReturnValue(lockQuery),
      }),
    });
    const query = vi.fn(async function* () {
      yield { id: 'user-id' };
    });
    const prisma = {
      db: {
        raw: { sql },
      },
    } as unknown as PrismaService;
    const repository = new PrismaUserRepository(prisma);

    await repository.lockForUpdate('user-id', { query } as never);

    expect(query).toHaveBeenCalledWith(lockQuery);
    const [parts, userId] = sql.mock.calls[0] as [TemplateStringsArray, string];
    expect(parts.join('?')).toMatch(
      /SELECT id FROM users WHERE id = \? FOR UPDATE/,
    );
    expect(userId).toBe('user-id');
  });
});
