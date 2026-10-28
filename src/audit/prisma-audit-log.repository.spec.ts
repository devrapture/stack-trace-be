import { Temporal } from 'temporal-polyfill/full';
import { vi } from 'vitest';
import type { PrismaService } from '../prisma/prisma.service.js';
import { PrismaAuditLogRepository } from './prisma-audit-log.repository.js';

const CREATED_AT = Temporal.Instant.from('2026-10-13T08:00:00Z');
const CURSOR_CREATED_AT = Temporal.Instant.from('2026-10-12T08:00:00Z');

function createRepository() {
  const row = {
    id: '123e4567-e89b-42d3-a456-426614174000',
    userId: '123e4567-e89b-42d3-a456-426614174001',
    actorUserId: null,
    eventType: 'PASSWORD_CHANGED' as const,
    metadata: null,
    createdAt: CREATED_AT,
  };
  const all = vi.fn().mockResolvedValue([row]);
  const limit = vi.fn().mockReturnValue({ all });
  const cursorAll = vi.fn().mockResolvedValue([row]);
  const cursorLimit = vi.fn().mockReturnValue({ all: cursorAll });
  const cursor = vi.fn().mockReturnValue({ limit: cursorLimit });
  const orderBy = vi.fn().mockReturnValue({ cursor, limit });
  const prisma = {
    db: {
      orm: {
        public: {
          AuditLog: { orderBy },
        },
      },
    },
  } as unknown as PrismaService;

  return {
    repository: new PrismaAuditLogRepository(prisma),
    all,
    cursor,
    cursorAll,
    cursorLimit,
    limit,
  };
}

describe('PrismaAuditLogRepository.list', () => {
  it('maps audit timestamps to Date without a cursor', async () => {
    const { all, limit, repository } = createRepository();

    const result = await repository.list({ limit: 50 });

    expect(limit).toHaveBeenCalledWith(50);
    expect(all).toHaveBeenCalledOnce();
    expect(result[0]?.createdAt).toEqual(
      new Date(CREATED_AT.epochMilliseconds),
    );
    expect(result[0]?.createdAt).toBeInstanceOf(Date);
  });

  it('maps audit timestamps to Date when keyset pagination uses a cursor', async () => {
    const { cursor, cursorAll, cursorLimit, repository } = createRepository();
    const cursorId = '123e4567-e89b-42d3-a456-426614174002';

    const result = await repository.list({
      limit: 25,
      cursor: {
        createdAt: CURSOR_CREATED_AT,
        id: cursorId,
      },
    });

    expect(cursor).toHaveBeenCalledWith({
      createdAt: CURSOR_CREATED_AT,
      id: cursorId,
    });
    expect(cursorLimit).toHaveBeenCalledWith(25);
    expect(cursorAll).toHaveBeenCalledOnce();
    expect(result[0]?.createdAt).toEqual(
      new Date(CREATED_AT.epochMilliseconds),
    );
    expect(result[0]?.createdAt).toBeInstanceOf(Date);
  });
});
