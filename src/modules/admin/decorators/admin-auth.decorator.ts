import { UseGuards, applyDecorators } from '@nestjs/common';
import { AdminAuthGuard } from '../guards/admin-auth.guard';
import { AdminPermissionGuard } from '../guards/admin-permission.guard';
import { Public } from 'src/common/decorators/public.decorator';

/**
 * @AdminAuth() decorator
 * Protects routes requiring admin authentication (and, where present,
 * @AdminPermission() metadata).
 *
 * Usage:
 * @AdminAuth()
 * getRoles() { ... }
 *
 * Two things bundled here, both load-bearing for correct execution order:
 *
 * 1. Admin tokens are signed with a separate secret/audience than user tokens,
 *    so the global JwtAuthGuard (regular 'jwt' strategy) always rejects them
 *    with a generic 401 before any route guard runs. @Public() opts the route
 *    out of that global guard — AdminAuthGuard becomes the sole, real
 *    authenticator, validating the token via the 'admin-jwt' strategy.
 *
 * 2. AdminPermissionGuard is registered HERE (not in @AdminPermission()) so it
 *    always runs after AdminAuthGuard. NestJS resolves stacked `@AdminAuth()`
 *    + `@AdminPermission()` decorators into a single guards array via
 *    `extendArrayMetadata` (`[...previous, ...new]`); since decorators apply
 *    bottom-up, a guard registered by @AdminPermission() would land *before*
 *    AdminAuthGuard in that array — running the permission check before
 *    `request.user` is populated, and failing every time with "Admin context
 *    not found". AdminPermissionGuard no-ops when no @AdminPermission()
 *    metadata is present, so it's safe to always include it here.
 */
export function AdminAuth() {
  return applyDecorators(Public(), UseGuards(AdminAuthGuard, AdminPermissionGuard));
}
