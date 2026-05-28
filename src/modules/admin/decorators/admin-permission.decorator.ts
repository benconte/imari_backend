import { SetMetadata, UseGuards, applyDecorators } from '@nestjs/common';
import { AdminPermissionGuard } from '../guards/admin-permission.guard';
import { AdminPermissionKey } from '../constants/permissions.constant';

export const ADMIN_PERMISSION_KEY = 'admin_permissions';
export const ADMIN_PERMISSION_MODE = 'admin_permission_mode';

/**
 * @AdminPermission() decorator
 * Checks fine-grained permissions on admin routes
 *
 * Usage:
 * // Requires ANY of the listed permissions (default)
 * @AdminPermission('wallets:freeze', 'wallets:unfreeze')
 * freezeWallet() { ... }
 *
 * // Requires ALL of the listed permissions
 * @AdminPermission(['users:suspend', 'audit:read'], 'ALL')
 * suspendUser() { ... }
 *
 * Parameters:
 * @param permissions - Single permission or array of permissions
 * @param mode - 'ANY' (default) or 'ALL'
 *   - 'ANY': Admin needs at least one permission
 *   - 'ALL': Admin needs all permissions
 *
 * Effective permissions = ROLE_PERMISSIONS[role] ∪ admin.permissions[]
 * Wildcard '*' permission grants everything
 */
export function AdminPermission(
  permissions: AdminPermissionKey | AdminPermissionKey[],
  mode: 'ANY' | 'ALL' = 'ANY',
) {
  const perms = Array.isArray(permissions) ? permissions : [permissions];

  return applyDecorators(
    SetMetadata(ADMIN_PERMISSION_KEY, perms),
    SetMetadata(ADMIN_PERMISSION_MODE, mode),
    UseGuards(AdminPermissionGuard),
  );
}
