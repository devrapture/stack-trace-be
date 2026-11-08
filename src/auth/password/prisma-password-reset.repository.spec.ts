import { vi } from 'vitest';
import { Temporal } from 'temporal-polyfill/full';
import type { TransactionClient } from '../../prisma/db.js';
import type { PrismaService } from '../../prisma/prisma.service.js';
import { PrismaPasswordRepository } from './prisma-password-reset.repository.js';

describe('PrismaPasswordRepository', () => {
  it.each([
    ['claims an available notice cooldown', true, true],
    ['rejects an active notice cooldown', false, false],
  ])('%s', async (_name, rowReturned, expected) => {
    const cooldownQuery = {};
    const sql = vi.fn().mockReturnValue({
      returnsRow: vi.fn().mockReturnValue({
        build: vi.fn().mockReturnValue(cooldownQuery),
      }),
    });
    const query = vi.fn(async function* () {
      if (rowReturned) yield { id: 'user-id' };
    });
    const prisma = {
      db: {
        raw: { sql },
        runtime: vi.fn().mockReturnValue({ query }),
        orm: { public: {} },
      },
    } as unknown as PrismaService;

    const repository = new PrismaPasswordRepository(prisma);

    await expect(
      repository.claimNoticeCooldown('user-id', 60_000),
    ).resolves.toBe(expected);
    expect(query).toHaveBeenCalledWith(cooldownQuery);

    const [parts, userId, cooldownMs] = sql.mock.calls[0] as [
      TemplateStringsArray,
      string,
      number,
    ];
    expect(parts.join('?')).toMatch(
      /UPDATE users[\s\S]*password_recovery_notice_sent_at[\s\S]*RETURNING id/,
    );
    expect(userId).toBe('user-id');
    expect(cooldownMs).toBe(60_000);
  });

  it('invalidates and creates the challenge on the transaction client', async () => {
    const lockQuery = {};
    const sql = vi.fn().mockReturnValue({
      returnsRow: vi.fn().mockReturnValue({
        build: vi.fn().mockReturnValue(lockQuery),
      }),
    });
    const updateAll = vi.fn().mockResolvedValue(undefined);
    const first = vi.fn().mockResolvedValue(null);
    const orderBy = vi.fn().mockReturnValue({ first });
    const where = vi.fn().mockReturnValue({ orderBy, updateAll });
    const create = vi.fn().mockResolvedValue({ id: 'challenge-id' });
    const tx = {
      query: vi.fn(async function* () {
        yield { id: 'user-id' };
      }),
      orm: {
        public: {
          PasswordResetChallenge: { where, create },
        },
      },
    };
    const outerWhere = vi.fn();
    const outerCreate = vi.fn();
    const prisma = {
      db: {
        raw: { sql },
        orm: {
          public: {
            PasswordResetChallenge: {
              where: outerWhere,
              create: outerCreate,
            },
          },
        },
        transaction: vi.fn(
          async (callback: (transaction: typeof tx) => Promise<string>) =>
            callback(tx),
        ),
      },
    } as unknown as PrismaService;

    const repository = new PrismaPasswordRepository(prisma);
    const challengeId = await repository.invalidateActiveAndCreate({
      userId: 'user-id',
      otpHash: 'otp-hash',
      expiresAt: new Date('2026-10-08T12:00:00.000Z'),
      maxAttempts: 5,
      cooldownMs: 60_000,
    });

    expect(challengeId).toBe('challenge-id');
    expect(tx.query).toHaveBeenCalledWith(lockQuery);
    expect(where).toHaveBeenCalledWith({
      userId: 'user-id',
      consumedAt: null,
    });
    expect(updateAll).toHaveBeenCalledOnce();
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-id',
        otpHash: 'otp-hash',
        maxAttempts: 5,
        attemptCount: 0,
      }),
    );
    expect(outerWhere).not.toHaveBeenCalled();
    expect(outerCreate).not.toHaveBeenCalled();
  });

  it('atomically claims and maps one verification attempt', async () => {
    const attemptQuery = {};
    const expiresAt = Temporal.Instant.from('2026-10-08T12:00:00Z');
    const sql = vi.fn().mockReturnValue({
      returnsRow: vi.fn().mockReturnValue({
        build: vi.fn().mockReturnValue(attemptQuery),
      }),
    });
    const query = vi.fn(async function* () {
      yield {
        id: 'challenge-id',
        otpHash: 'otp-hash',
        expiresAt,
        attemptCount: 1,
        maxAttempts: 5,
      };
    });
    const prisma = {
      db: {
        raw: { sql },
        runtime: vi.fn().mockReturnValue({ query }),
        orm: { public: {} },
      },
    } as unknown as PrismaService;

    const repository = new PrismaPasswordRepository(prisma);
    const challenge = await repository.claimAttempt('user-id');

    expect(query).toHaveBeenCalledWith(attemptQuery);
    expect(challenge?.attemptCount).toBe(1);
    expect(challenge?.expiresAt).toBeInstanceOf(Date);
    expect(challenge?.expiresAt.toISOString()).toBe('2026-10-08T12:00:00.000Z');

    const [parts, userId] = sql.mock.calls[0] as [TemplateStringsArray, string];
    const statement = parts.join('?');
    expect(userId).toBe('user-id');
    expect(statement).toMatch(
      /SET attempt_count = challenge\.attempt_count \+ 1/,
    );
    expect(statement).toMatch(/challenge\.consumed_at IS NULL/);
    expect(statement).toMatch(/challenge\.expires_at > clock_timestamp\(\)/);
    expect(statement).toMatch(
      /challenge\.attempt_count < challenge\.max_attempts/,
    );
    expect(statement).toMatch(/RETURNING challenge\.id/);
  });

  it('returns null when no verification attempt can be claimed', async () => {
    const attemptQuery = {};
    const sql = vi.fn().mockReturnValue({
      returnsRow: vi.fn().mockReturnValue({
        build: vi.fn().mockReturnValue(attemptQuery),
      }),
    });
    const query = vi.fn(async function* () {});
    const prisma = {
      db: {
        raw: { sql },
        runtime: vi.fn().mockReturnValue({ query }),
        orm: { public: {} },
      },
    } as unknown as PrismaService;

    const repository = new PrismaPasswordRepository(prisma);

    await expect(repository.claimAttempt('user-id')).resolves.toBeNull();
  });

  it.each([
    ['consumes an active challenge', true, true],
    ['rejects an inactive challenge', false, false],
  ])('%s', async (_name, rowReturned, expected) => {
    const consumeQuery = {};
    const sql = vi.fn().mockReturnValue({
      returnsRow: vi.fn().mockReturnValue({
        build: vi.fn().mockReturnValue(consumeQuery),
      }),
    });
    const query = vi.fn(async function* () {
      if (rowReturned) yield { id: 'challenge-id' };
    });
    const tx = { query } as unknown as TransactionClient;
    const prisma = {
      db: {
        raw: { sql },
        orm: { public: {} },
      },
    } as unknown as PrismaService;

    const repository = new PrismaPasswordRepository(prisma);

    await expect(repository.consumeIfActive('challenge-id', tx)).resolves.toBe(
      expected,
    );
    expect(query).toHaveBeenCalledWith(consumeQuery);

    const [parts, challengeId] = sql.mock.calls[0] as [
      TemplateStringsArray,
      string,
    ];
    const statement = parts.join('?');
    expect(challengeId).toBe('challenge-id');
    expect(statement).toMatch(/consumed_at IS NULL/);
    expect(statement).toMatch(/expires_at > clock_timestamp\(\)/);
    expect(statement).toMatch(/attempt_count > 0/);
    expect(statement).toMatch(/attempt_count <= max_attempts/);
    expect(statement).toMatch(/RETURNING id/);
  });
});
