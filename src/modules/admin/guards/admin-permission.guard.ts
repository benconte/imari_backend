import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  getEffectivePermissions,
  hasAllPermissions,
  hasAnyPermission,
} from '../constants/role-permissions.constant';
import { AdminPermissionKey } from '../constants/permissions.constant';
import { ADMIN_PERMISSION_KEY, ADMIN_PERMISSION_MODE } from '../decorators/admin-permission.decorator';

/**
 * Admin Permission Guard
 * Checks fine-grained permissions on admin
 * Works in conjunction with @AdminPermission() decorator
 *
 * Usage:
 * @AdminPermission('wallets:freeze', 'wallets:unfreeze') // requires ANY one
 * @AdminPermission(['wallets:freeze', 'wallets:unfreeze'], 'ALL') // requires ALL
 */
@Injectable()
export class AdminPermissionGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPermissions = this.reflector.get<AdminPermissionKey[]>(
      ADMIN_PERMISSION_KEY,
      context.getHandler(),
    );

    // No permission decorator = no restriction
    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    const mode = this.reflector.get<'ALL' | 'ANY'>(
      ADMIN_PERMISSION_MODE,
      context.getHandler(),
    ) || 'ANY';

    const request = context.switchToHttp().getRequest();
    const admin = request.user;

    if (!admin) {
      throw new ForbiddenException('Admin context not found');
    }

    const effectivePermissions = getEffectivePermissions(admin.role, admin.permissions);

    const hasAccess =
      mode === 'ALL'
        ? hasAllPermissions(effectivePermissions, requiredPermissions)
        : hasAnyPermission(effectivePermissions, requiredPermissions);

    if (!hasAccess) {
      throw new ForbiddenException(
        `Insufficient permissions. Required: ${requiredPermissions.join(', ')} (mode: ${mode})`,
      );
    }

    return true;
  }
}
