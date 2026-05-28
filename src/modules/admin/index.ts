/**
 * Admin Module Exports
 * All public API for admin authentication & authorization
 */

// Services
export { AdminService } from './admin.service';

// Guards
export { AdminAuthGuard } from './guards/admin-auth.guard';
export { AdminPermissionGuard } from './guards/admin-permission.guard';

// Decorators
export { AdminAuth } from './decorators/admin-auth.decorator';
export { AdminPermission } from './decorators/admin-permission.decorator';

// Constants
export {
  ADMIN_PERMISSIONS,
  type AdminPermissionKey,
} from './constants/permissions.constant';
export {
  ROLE_PERMISSIONS,
  getEffectivePermissions,
  hasPermission,
  hasAnyPermission,
  hasAllPermissions,
} from './constants/role-permissions.constant';

// DTOs
export { AdminLoginDto } from './dto/admin-login.dto';

// Strategies
export { AdminJwtStrategy } from './strategies/admin-jwt.strategy';
