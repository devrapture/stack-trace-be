import {
  CanActivate,
  ExecutionContext,
  HttpStatus,
  Inject,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AppError } from '../common/error/app-error.js';
import { ErrorCode } from '../common/error/error-codes.js';
import type { RequestUser } from '../sessions/jwt.strategy.js';
import {
  USERS_REPOSITORY,
  type UsersRepository,
} from '../users/users.repository.js';
import { roleHasPermission, type Permission } from './permissions.js';
import { PERMISSION_METADATA_KEY } from './require-permission.decorator.js';

/**
 * Always runs AFTER `JwtAuthGuard` (Nest evaluates `@UseGuards(...)`
 * in array order), so `request.user` is already populated — this
 * guard only adds the permission check on top.
 *
 * Deliberately queries the user's CURRENT role from the database on
 * every request, rather than trusting anything from the access
 * token. This is a genuine, deliberate exception to Milestone 7's
 * "access tokens are never re-checked against the database" rule —
 * made here specifically BECAUSE role is security-sensitive and can
 * change between requests (an admin demoted mid-session must lose
 * access on their very next request, not up to 15 minutes later).
 * Ordinary authenticated routes stay fast and stateless; this one
 * extra database round-trip is the accepted cost of admin routes
 * needing to reflect the CURRENT truth, not a token's snapshot of it.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(USERS_REPOSITORY)
    private readonly usersRepository: UsersRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.get<Permission | undefined>(
      PERMISSION_METADATA_KEY,
      context.getHandler(),
    );

    if (!required) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{ user: RequestUser }>();
    const user = await this.usersRepository.getUserById(request.user.userId);

    if (!user || !roleHasPermission(user.role, required))
      throw new AppError(
        ErrorCode.INSUFFICIENT_PERMISSION,
        'You do not have permission to perform this action.',
        HttpStatus.FORBIDDEN,
      );

    return true;
  }
}
