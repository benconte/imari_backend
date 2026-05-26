import { UseGuards, applyDecorators } from '@nestjs/common';
import { AdminAuthGuard } from '../guards/admin-auth.guard';

/**
 * @AdminAuth() decorator
 * Protects routes requiring admin authentication
 *
 * Usage:
 * @AdminAuth()
 * getRoles() { ... }
 *
 * Automatically applies AdminAuthGuard
 * Validates JWT using admin-jwt strategy
 */
export function AdminAuth() {
  return applyDecorators(UseGuards(AdminAuthGuard));
}
