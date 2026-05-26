import { Controller, Get, Freeze, Post, Param, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { AdminAuth, AdminPermission, ADMIN_PERMISSIONS } from '@modules/admin';

/**
 * ============================================================
 * EXAMPLE: How to Build Protected Admin Endpoints
 * ============================================================
 *
 * This is a template showing how to create admin-protected routes
 * in your controllers (e.g., WalletController, UserController, etc.)
 *
 * Pattern:
 * 1. @AdminAuth() - Validates admin JWT
 * 2. @AdminPermission() - Checks fine-grained permissions
 * 3. Route handler with admin context from @Req() or dependency injection
 */

@ApiTags('Admin / Wallet Management')
@Controller('api/v1/admin/wallets')
export class AdminWalletController {
  constructor(
    // Inject your services here
    // private walletService: WalletService,
    // private auditService: AuditService,
  ) {}

  // ============================================================
  // PATTERN 1: Single Permission Required
  // ============================================================

  /**
   * Freeze wallet
   * Requires: wallets:freeze permission
   *
   * Who can do this?
   * ✓ SUPER_ADMIN (has *)
   * ✓ OPS_ADMIN (has wallets:freeze in role)
   * ✓ FRAUD_OFFICER (has wallets:freeze in role)
   * ✓ SUPPORT (does NOT have wallets:freeze) ✗
   * ✓ READ_ONLY (does NOT have wallets:freeze) ✗
   *
   * Unless SUPPORT admin has it added in admin.permissions[]
   */
  @Post(':walletId/freeze')
  @AdminAuth()
  @AdminPermission(ADMIN_PERMISSIONS.WALLETS_FREEZE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Freeze wallet',
    description: 'Prevent all transactions on wallet. Requires wallets:freeze permission.',
  })
  @ApiBearerAuth()
  @ApiResponse({ status: 200, description: 'Wallet frozen' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  async freezeWallet(@Param('walletId') walletId: string, @Req() req: any) {
    // req.user contains admin object:
    // {
    //   id: 'uuid',
    //   email: 'admin@imari.com',
    //   role: 'OPS_ADMIN',
    //   permissions: [...],
    //   firstName: 'Admin',
    //   lastName: 'User',
    // }

    // Example implementation
    console.log(`Admin ${req.user.email} freezing wallet ${walletId}`);
    // await this.walletService.freeze(walletId);
    // await this.auditService.log('WALLET_FROZEN', { walletId, adminId: req.user.id });
    return { message: 'Wallet frozen', walletId };
  }

  // ============================================================
  // PATTERN 2: Multiple Permissions (ANY mode - default)
  // Requires: At least ONE of the listed permissions
  // ============================================================

  /**
   * Manage wallet limits
   * Requires: wallets:adjust_limit OR wallets:freeze (any one)
   *
   * Scenario: Different admins have different ways to manage limits
   * - OPS_ADMIN with wallets:adjust_limit can change limits
   * - OPS_ADMIN with wallets:freeze can also manage via freezing
   *
   * Who can do this?
   * ✓ Admin with wallets:adjust_limit
   * ✓ Admin with wallets:freeze
   * ✗ Admin with neither
   */
  @Patch(':walletId/limit')
  @AdminAuth()
  @AdminPermission([ADMIN_PERMISSIONS.WALLETS_ADJUST_LIMIT, ADMIN_PERMISSIONS.WALLETS_FREEZE])
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Adjust wallet limit',
    description: 'Change daily/monthly limits. Requires wallets:adjust_limit OR wallets:freeze.',
  })
  @ApiBearerAuth()
  async adjustLimit(
    @Param('walletId') walletId: string,
    @Body() body: { dailyLimit: number; monthlyLimit: number },
    @Req() req: any,
  ) {
    console.log(`Admin ${req.user.email} adjusting limits for wallet ${walletId}`);
    return { message: 'Limits adjusted', walletId, ...body };
  }

  // ============================================================
  // PATTERN 3: Multiple Permissions (ALL mode)
  // Requires: ALL of the listed permissions
  // ============================================================

  /**
   * Restore wallet after freeze
   * Requires: wallets:unfreeze AND audit:read (all permissions)
   *
   * Scenario: Admin must be able to:
   * 1. Unfreeze the wallet (wallets:unfreeze)
   * 2. Read audit logs to understand why it was frozen (audit:read)
   *
   * Who can do this?
   * ✓ Admin with BOTH wallets:unfreeze AND audit:read
   * ✗ Admin with only wallets:unfreeze (missing audit:read)
   * ✗ Admin with only audit:read (missing wallets:unfreeze)
   *
   * Typical: OPS_ADMIN has both
   */
  @Post(':walletId/unfreeze')
  @AdminAuth()
  @AdminPermission(
    [ADMIN_PERMISSIONS.WALLETS_UNFREEZE, ADMIN_PERMISSIONS.AUDIT_READ],
    'ALL', // ← ALL mode: requires both permissions
  )
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Unfreeze wallet',
    description: 'Restore wallet after freeze. Requires wallets:unfreeze AND audit:read permissions.',
  })
  @ApiBearerAuth()
  async unfreezeWallet(@Param('walletId') walletId: string, @Req() req: any) {
    console.log(`Admin ${req.user.email} unfreezing wallet ${walletId}`);
    return { message: 'Wallet unfrozen', walletId };
  }

  // ============================================================
  // PATTERN 4: Read-Only Endpoint (no permission required)
  // Just @AdminAuth() for authentication
  // ============================================================

  /**
   * Get wallet details
   * Requires: Admin authentication only (no specific permission)
   *
   * All authenticated admins can read wallet details
   * If you want to restrict to specific roles, add @AdminPermission()
   */
  @Get(':walletId')
  @AdminAuth()
  // No @AdminPermission() = all authenticated admins can access
  @ApiOperation({
    summary: 'Get wallet details',
    description: 'Read wallet information. Requires admin authentication.',
  })
  @ApiBearerAuth()
  async getWallet(@Param('walletId') walletId: string, @Req() req: any) {
    console.log(`Admin ${req.user.email} viewing wallet ${walletId}`);
    return {
      walletId,
      balance: 50000,
      status: 'ACTIVE',
      dailyLimit: 500000,
      viewedBy: req.user.email,
    };
  }

  // ============================================================
  // PATTERN 5: Wildcard Permission Check (grant everything)
  // ============================================================

  /**
   * Admin-only operation with no specific permission check
   *
   * Example: If you manually check permissions in handler:
   *
   * const { hasPermission } = require('@modules/admin');
   * const permissions = getEffectivePermissions(admin.role, admin.permissions);
   *
   * if (!hasPermission(permissions, ADMIN_PERMISSIONS.WALLETS_FREEZE)) {
   *   throw new ForbiddenException('Need wallets:freeze');
   * }
   */
}

// ============================================================
// DECORATORS REFERENCE
// ============================================================

/**
 * @AdminAuth()
 * ───────────
 * Protects route with admin JWT validation
 *
 * Usage:
 * @Get()
 * @AdminAuth()
 * getRoute() { }
 *
 * Validates:
 * ✓ JWT token present in Authorization header
 * ✓ Token signature valid (JWT_ADMIN_SECRET)
 * ✓ Token not expired
 * ✓ Admin still exists and isActive = true
 *
 * Throws: UnauthorizedException (401)
 */

/**
 * @AdminPermission()
 * ──────────────────
 * Checks fine-grained permissions
 *
 * Usage #1: Single permission (ANY mode)
 * @AdminPermission('wallets:freeze')
 *
 * Usage #2: Multiple permissions (ANY mode - requires at least one)
 * @AdminPermission(['wallets:freeze', 'wallets:unfreeze'])
 *
 * Usage #3: Multiple permissions (ALL mode - requires all)
 * @AdminPermission(['transactions:reverse', 'audit:read'], 'ALL')
 *
 * Permission Calculation:
 * effectivePerms = ROLE_PERMISSIONS[admin.role] ∪ admin.permissions[]
 *
 * Throws: ForbiddenException (403)
 */

// ============================================================
// PERMISSION CONSTANTS
// ============================================================

/**
 * Available permissions:
 * 
 * User Management:
 *   users:read, users:suspend, users:verify_kyc, users:reject_kyc,
 *   users:reset_password, users:delete
 *
 * Wallet Management:
 *   wallets:read, wallets:freeze, wallets:unfreeze, wallets:adjust_limit
 *
 * Transaction Management:
 *   transactions:read, transactions:reverse, transactions:refund,
 *   transactions:mark_suspect
 *
 * Fraud Management:
 *   fraud:read_alerts, fraud:resolve_alerts, fraud:mark_false_positive
 *
 * KYC & Compliance:
 *   kyc:read, kyc:review, kyc:approve, kyc:reject
 *
 * Audit & Logs:
 *   audit:read, audit:export
 *
 * Admin Management:
 *   admin_users:read, admin_users:create, admin_users:update,
 *   admin_users:delete, admin_users:manage_permissions,
 *   admin_users:manage_roles
 *
 * System & Configuration:
 *   system:config_read, system:config_update, system:health_read
 *
 * Support:
 *   support:notes_add, support:notes_read
 *
 * Wildcard:
 *   * (grants all permissions)
 */

// ============================================================
// TESTING ADMIN ENDPOINTS
// ============================================================

/**
 * 1. Login
 * POST /api/v1/admin/login
 * Body: { "email": "admin@imari.com", "password": "xxx" }
 * Save accessToken
 *
 * 2. Call protected endpoint
 * GET /api/v1/admin/wallets/wallet-uuid
 * Header: Authorization: Bearer {accessToken}
 *
 * 3. If 403 Forbidden
 * Admin doesn't have required permission
 * Check: admin.role + admin.permissions[]
 * Ask: What role do they need? Or add extra permission?
 *
 * 4. If 401 Unauthorized
 * Token expired or invalid
 * Get new token via POST /api/v1/admin/refresh
 */
