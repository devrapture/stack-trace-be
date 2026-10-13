import { BadRequestException } from '@nestjs/common';
import { Temporal } from 'temporal-polyfill/full';
import { vi } from 'vitest';
import type { AuditLogRepository } from '../audit/audit-log.repository.js';
import { AdminController } from './admin.controller.js';

function createController(
  entries: Awaited<ReturnType<AuditLogRepository['list']>> = [],
) {
  const list = vi.fn().mockResolvedValue(entries);
  const controller = new AdminController({
    list,
  } as unknown as AuditLogRepository);

  return { controller, list };
}

describe('AdminController.listAuditLogs', () => {
  it('uses the default page size and returns the repository entries', async () => {
    const entries = [
      {
        id: 'log-id',
        userId: 'user-id',
        actorUserId: null,
        eventType: 'PASSWORD_CHANGED' as const,
        metadata: null,
        createdAt: new Date('2026-10-13T08:00:00.000Z'),
      },
    ];
    const { controller, list } = createController(entries);

    await expect(controller.listAuditLogs({})).resolves.toBe(entries);
    expect(list).toHaveBeenCalledWith({ limit: 50 });
  });

  it('parses a composite cursor before querying the repository', async () => {
    const { controller, list } = createController();

    await controller.listAuditLogs({
      limit: 25,
      cursor: JSON.stringify({
        createdAt: '2026-10-13T08:00:00.000Z',
        id: 'log-id',
      }),
    });

    expect(list).toHaveBeenCalledWith({
      limit: 25,
      cursor: {
        createdAt: Temporal.Instant.from('2026-10-13T08:00:00.000Z'),
        id: 'log-id',
      },
    });
  });

  it('rejects an invalid cursor without querying the repository', async () => {
    const { controller, list } = createController();

    await expect(
      controller.listAuditLogs({ cursor: 'not-a-cursor' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(list).not.toHaveBeenCalled();
  });
});
