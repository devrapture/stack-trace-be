import { Temporal } from 'temporal-polyfill/full';
import { vi } from 'vitest';
import type { PrismaService } from '../prisma/prisma.service.js';
import { PrismaAuthSessionsRepository } from './prisma-auth-sessions.repository.js';

const NOW = Temporal.Instant.from('2026-10-05T12:00:00Z');

function createRepository(createError?: Error) {
  const createdSession = {
    id: 'session-id',
    userId: 'user-id',
    refreshTokenHash: 'refresh-token-hash',
    previousTokenHash: null,
    clientType: 'WEB' as const,
    deviceName: 'Chrome on Mac',
    revokedAt: null,
    expiresAt: NOW.add({ hours: 30 * 24 }),
    lastUsedAt: NOW,
    createdAt: NOW,
  };
  const all = vi.fn().mockResolvedValue([]);
  const orderBy = vi.fn().mockReturnValue({ all });
  const expiresAtGt = vi.fn();
  const comparisonWhere = vi
    .fn()
    .mockImplementation(
      (
        predicate: (session: { expiresAt: { gt: typeof expiresAtGt } }) => void,
      ) => {
        predicate({ expiresAt: { gt: expiresAtGt } });
        return { orderBy };
      },
    );
  const authSessionWhere = vi.fn().mockReturnValue({
    where: comparisonWhere,
  });
  const create = createError
    ? vi.fn().mockRejectedValue(createError)
    : vi.fn().mockResolvedValue(createdSession);
  const userUpdate = vi.fn().mockResolvedValue({});
  const userWhere = vi.fn().mockReturnValue({ update: userUpdate });
  const tx = {
    query: vi.fn(async function* () {
      yield { id: 'user-id' };
    }),
    orm: {
      public: {
        AuthSession: { where: authSessionWhere, create },
        User: { where: userWhere },
      },
    },
  };
  const sql = vi.fn().mockReturnValue({
    returnsRow: vi.fn().mockReturnValue({
      build: vi.fn().mockReturnValue({}),
    }),
  });
  const prisma = {
    db: {
      orm: { public: {} },
      raw: { sql },
      transaction: vi.fn(
        async (callback: (transaction: typeof tx) => Promise<unknown>) =>
          callback(tx),
      ),
    },
  } as unknown as PrismaService;

  return {
    repository: new PrismaAuthSessionsRepository(prisma),
    create,
    expiresAtGt,
    userUpdate,
    userWhere,
  };
}

describe('PrismaAuthSessionsRepository.createEnforcingLimit', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('updates lastLoginAt after creating a session', async () => {
    vi.spyOn(Temporal.Now, 'instant').mockReturnValue(NOW);
    const { repository, expiresAtGt, userUpdate, userWhere } =
      createRepository();

    await repository.createEnforcingLimit(
      {
        userId: 'user-id',
        refreshTokenHash: 'refresh-token-hash',
        clientType: 'WEB',
        deviceName: 'Chrome on Mac',
        expiresAt: new Date('2026-11-04T12:00:00Z'),
      },
      10,
    );

    expect(expiresAtGt).toHaveBeenCalledWith(NOW);
    expect(userWhere).toHaveBeenCalledWith({ id: 'user-id' });
    expect(userUpdate).toHaveBeenCalledWith({ lastLoginAt: NOW });
  });

  it('does not update lastLoginAt when session creation fails', async () => {
    vi.spyOn(Temporal.Now, 'instant').mockReturnValue(NOW);
    const createError = new Error('session insert failed');
    const { repository, userUpdate } = createRepository(createError);

    await expect(
      repository.createEnforcingLimit(
        {
          userId: 'user-id',
          refreshTokenHash: 'refresh-token-hash',
          clientType: 'WEB',
          expiresAt: new Date('2026-11-04T12:00:00Z'),
        },
        10,
      ),
    ).rejects.toBe(createError);

    expect(userUpdate).not.toHaveBeenCalled();
  });
});

describe('PrismaAuthSessionsRepository.findByIdForUpdate', () => {
  it('locks and returns the requested session inside the supplied transaction', async () => {
    const row = {
      id: 'session-id',
      userId: 'user-id',
      clientType: 'WEB' as const,
      deviceName: null,
      revokedAt: null,
      expiresAt: NOW.add({ hours: 1 }),
      lastUsedAt: NOW,
      createdAt: NOW,
    };
    const first = vi.fn().mockResolvedValue(row);
    const where = vi.fn().mockReturnValue({ first });
    const lockQuery = { kind: 'lock-session' };
    const build = vi.fn().mockReturnValue(lockQuery);
    const returnsRow = vi.fn().mockReturnValue({ build });
    const sql = vi.fn().mockReturnValue({ returnsRow });
    const query = vi.fn(async function* () {
      yield { id: 'session-id' };
    });
    const tx = {
      query,
      orm: { public: { AuthSession: { where } } },
    };
    const prisma = {
      db: { raw: { sql }, orm: { public: {} } },
    } as unknown as PrismaService;
    const repository = new PrismaAuthSessionsRepository(prisma);

    await expect(
      repository.findByIdForUpdate('session-id', tx as never),
    ).resolves.toEqual(
      expect.objectContaining({
        id: 'session-id',
        userId: 'user-id',
        revokedAt: null,
      }),
    );

    expect(query).toHaveBeenCalledWith(lockQuery);
    expect(where).toHaveBeenCalledWith({ id: 'session-id' });
  });
});
