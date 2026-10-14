import { HttpStatus } from '@nestjs/common';
import type { PinoLogger } from 'nestjs-pino';
import { vi } from 'vitest';
import type { AuditLogRepository } from '../../audit/audit-log.repository.js';
import { AppError } from '../../common/error/app-error.js';
import { ErrorCode } from '../../common/error/error-codes.js';
import type { EmailProvider } from '../../email/email-provider.js';
import type { TransactionClient } from '../../prisma/db.js';
import type { PrismaUnitOfWork } from '../../prisma/prisma-unit-of-work.js';
import type { AuthSessionsRepository } from '../../sessions/auth-sessions.repository.js';
import type { UsersRepository } from '../../users/users.repository.js';
import type { PasswordCredentialsRepository } from './password-credentials.repository.js';
import { PasswordManagementService } from './password-management.service.js';
import type { PasswordHasher } from './password.hasher.js';

function createService(passwordUpdated: boolean) {
  const transaction = {} as TransactionClient;
  const passwords = {
    findHashByUserId: vi.fn().mockResolvedValue('current-password-hash'),
    updateHashForUserIfCurrent: vi.fn().mockResolvedValue(passwordUpdated),
  } as unknown as PasswordCredentialsRepository;
  const sessions = {
    revokeAllForUser: vi.fn().mockResolvedValue(undefined),
  } as unknown as AuthSessionsRepository;
  const auditLog = {
    record: vi.fn().mockResolvedValue(undefined),
  } as unknown as AuditLogRepository;
  const users = {
    getUserById: vi.fn().mockResolvedValue(null),
  } as unknown as UsersRepository;
  const email = {
    send: vi.fn(),
  } as unknown as EmailProvider;
  const unitOfWork = {
    run: vi.fn(async (work: (tx: TransactionClient) => Promise<unknown>) =>
      work(transaction),
    ),
  } as unknown as PrismaUnitOfWork;
  const hasher = {
    verify: vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false),
    hash: vi.fn().mockResolvedValue('new-password-hash'),
  } as unknown as PasswordHasher;
  const logger = {
    error: vi.fn(),
    warn: vi.fn(),
  } as unknown as PinoLogger;

  return {
    service: new PasswordManagementService(
      passwords,
      unitOfWork,
      users,
      email,
      sessions,
      auditLog,
      hasher,
      logger,
    ),
    passwords,
    sessions,
    auditLog,
    transaction,
    users,
  };
}

describe('PasswordManagementService.changePassword', () => {
  const dto = {
    currentPassword: 'current-password',
    newPassword: 'different-password',
  };

  it('changes the password only while the verified hash is still current', async () => {
    const { auditLog, passwords, service, sessions, transaction } =
      createService(true);

    await expect(
      service.changePassword('user-id', 'current-session-id', dto),
    ).resolves.toEqual({
      message:
        'Password changed. You have been signed out on every other device.',
    });

    expect(passwords.updateHashForUserIfCurrent).toHaveBeenCalledWith(
      'user-id',
      'current-password-hash',
      'new-password-hash',
      transaction,
    );
    expect(sessions.revokeAllForUser).toHaveBeenCalledWith(
      'user-id',
      'PASSWORD_CHANGE',
      'current-session-id',
      transaction,
    );
    expect(auditLog.record).toHaveBeenCalledWith(
      {
        userId: 'user-id',
        eventType: 'PASSWORD_CHANGED',
      },
      transaction,
    );
    expect(
      vi.mocked(passwords.updateHashForUserIfCurrent).mock
        .invocationCallOrder[0],
    ).toBeLessThan(
      vi.mocked(sessions.revokeAllForUser).mock.invocationCallOrder[0],
    );
    expect(
      vi.mocked(sessions.revokeAllForUser).mock.invocationCallOrder[0],
    ).toBeLessThan(vi.mocked(auditLog.record).mock.invocationCallOrder[0]);
  });

  it('aborts without revoking sessions when another request wins the race', async () => {
    const { auditLog, passwords, service, sessions, transaction, users } =
      createService(false);

    await expect(
      service.changePassword('user-id', 'current-session-id', dto),
    ).rejects.toMatchObject({
      code: ErrorCode.CONFLICT,
      httpStatus: HttpStatus.CONFLICT,
    } satisfies Partial<AppError>);

    expect(passwords.updateHashForUserIfCurrent).toHaveBeenCalledWith(
      'user-id',
      'current-password-hash',
      'new-password-hash',
      transaction,
    );
    expect(sessions.revokeAllForUser).not.toHaveBeenCalled();
    expect(auditLog.record).not.toHaveBeenCalled();
    expect(users.getUserById).not.toHaveBeenCalled();
  });
});
