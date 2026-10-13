import { UserRole } from '../users/user.model';

export type Permission = 'admin:access';

const ROLE_PERMISSIONS: Record<UserRole, readonly Permission[]> = {
  PLAYER: [],
  ADMIN: ['admin:access'],
};

export const roleHasPermission = (
  role: UserRole,
  permission: Permission,
): boolean => ROLE_PERMISSIONS[role].includes(permission);
