import { SetMetadata } from '@nestjs/common';
import { Permission } from './permissions';

export const PERMISSION_METADATA_KEY = 'requiredPermission';

export const RequirePermission = (permission: Permission) =>
  SetMetadata(PERMISSION_METADATA_KEY, permission);
