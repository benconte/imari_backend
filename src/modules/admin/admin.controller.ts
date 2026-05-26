import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiResponse,
  ApiQuery,
} from '@nestjs/swagger';
import { AdminService } from './admin.service';
import { AdminLoginDto } from './dto/admin-login.dto';
import { AdminAuth } from './decorators/admin-auth.decorator';
import { AdminPermission } from './decorators/admin-permission.decorator';
import { ADMIN_PERMISSIONS } from './constants/permissions.constant';
import { Public } from 'src/common/decorators/public.decorator';

/**
 * Admin API Controller
 * Two-layer access control:
 * 1. @AdminAuth() - Validates JWT token
 * 2. @AdminPermission() - Checks fine-grained permissions
 *
 * Endpoints follow pattern:
 * @AdminAuth() - Protects route with admin JWT
 * @AdminPermission('resource:action') - Checks specific permission
 *
 * Examples:
 * @AdminPermission('wallets:freeze') - Requires one permission
 * @AdminPermission(['users:suspend', 'audit:read'], 'ALL') - Requires all
 */
@ApiTags('Admin')
@Controller('api/v1/admin')
export class AdminController {
  constructor(private adminService: AdminService) {}

  // ============================================================
  // AUTHENTICATION
  // ============================================================

  /**
   * Admin login
   * Issues separate JWT tokens:
   * - Access token: 15 minutes (for API requests)
   * - Refresh token: 12 hours (for getting new access tokens)
   *
   * Separate secret from user JWT for security boundary
   */
  @Post('login')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Admin login',
    description:
      'Authenticate admin with email & password. Returns separate JWT tokens (15min access / 12h refresh).',
  })
  @ApiResponse({
    status: 200,
    description: 'Login successful',
    schema: {
      example: {
        accessToken: 'eyJhbGc...',
        refreshToken: 'eyJhbGc...',
        admin: {
          id: 'uuid',
          email: 'admin@example.com',
          firstName: 'Admin',
          lastName: 'User',
          role: 'SUPER_ADMIN',
        },
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Invalid credentials or inactive account',
  })
  async login(@Body() credentials: AdminLoginDto) {
    return this.adminService.login(credentials);
  }

  /**
   * Refresh admin access token
   * Use refresh token to get new short-lived access token
   */
  @Post('refresh')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Refresh admin access token',
    description: 'Exchange refresh token for new access token (15min expiry)',
  })
  @ApiResponse({
    status: 200,
    description: 'Token refreshed',
    schema: {
      example: {
        accessToken: 'eyJhbGc...',
      },
    },
  })
  async refresh(@Body() body: { refreshToken: string }) {
    return this.adminService.refresh(body.refreshToken);
  }

  // ============================================================
  // ADMIN MANAGEMENT
  // ============================================================

  /**
   * Get current admin info
   */
  @Get('me')
  @AdminAuth()
  @ApiOperation({
    summary: 'Get current admin info',
    description: 'Returns authenticated admin profile with effective permissions',
  })
  @ApiBearerAuth()
  @ApiResponse({
    status: 200,
    description: 'Admin profile with effective permissions',
    schema: {
      example: {
        id: 'uuid',
        email: 'admin@example.com',
        firstName: 'Admin',
        lastName: 'User',
        role: 'OPS_ADMIN',
        permissions: ['users:suspend'],
        effectivePermissions: [
          'users:read',
          'wallets:read',
          'users:suspend',
          'wallets:freeze',
        ],
      },
    },
  })
  async getCurrentAdmin(@Req() req: any) {
    return this.adminService.getAdmin(req.user.id);
  }

  /**
   * List all admins
   * Requires ADMIN_USERS_READ permission
   */
  @Get()
  @AdminAuth()
  @AdminPermission(ADMIN_PERMISSIONS.ADMIN_USERS_READ)
  @ApiOperation({
    summary: 'List all admins',
    description: 'Get paginated list of all admin users. Requires admin_users:read permission.',
  })
  @ApiBearerAuth()
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 50 })
  @ApiQuery({ name: 'offset', required: false, type: Number, example: 0 })
  @ApiResponse({
    status: 200,
    description: 'List of admins with permissions',
  })
  @ApiResponse({
    status: 403,
    description: 'Insufficient permissions',
  })
  async listAdmins(
    @Query('limit') limit: number = 50,
    @Query('offset') offset: number = 0,
  ) {
    return this.adminService.getAllAdmins(limit, offset);
  }

  /**
   * Get admin by ID
   */
  @Get(':adminId')
  @AdminAuth()
  @AdminPermission(ADMIN_PERMISSIONS.ADMIN_USERS_READ)
  @ApiOperation({
    summary: 'Get admin by ID',
    description: 'Retrieve admin details with effective permissions',
  })
  @ApiBearerAuth()
  @ApiResponse({ status: 200, description: 'Admin details' })
  @ApiResponse({ status: 404, description: 'Admin not found' })
  async getAdmin(@Param('adminId') adminId: string) {
    return this.adminService.getAdmin(adminId);
  }

  /**
   * Update admin permissions
   * Requires ADMIN_USERS_MANAGE_PERMISSIONS permission
   *
   * Example: Grant support agent temporary transaction reversal access
   * "this support agent can also reverse transactions during their pilot week"
   */
  @Patch(':adminId/permissions')
  @AdminAuth()
  @AdminPermission(ADMIN_PERMISSIONS.ADMIN_USERS_MANAGE_PERMISSIONS)
  @ApiOperation({
    summary: 'Update admin permissions',
    description:
      'Grant additional fine-grained permissions to admin without changing role. E.g. grant temporary transaction reversal access.',
  })
  @ApiBearerAuth()
  @ApiResponse({
    status: 200,
    description: 'Permissions updated',
    schema: {
      example: {
        id: 'uuid',
        email: 'support@example.com',
        role: 'SUPPORT',
        permissions: ['transactions:reverse', 'transactions:refund'],
      },
    },
  })
  async updatePermissions(
    @Param('adminId') adminId: string,
    @Body() body: { permissions: string[] },
  ) {
    return this.adminService.updatePermissions(adminId, body.permissions);
  }

  /**
   * Update admin role
   * Requires ADMIN_USERS_MANAGE_ROLES permission
   *
   * Example: Promote support agent to fraud officer
   */
  @Patch(':adminId/role')
  @AdminAuth()
  @AdminPermission(ADMIN_PERMISSIONS.ADMIN_USERS_MANAGE_ROLES)
  @ApiOperation({
    summary: 'Update admin role',
    description:
      'Change admin role. Effective permissions = ROLE_PERMISSIONS[role] ∪ admin.permissions[]',
  })
  @ApiBearerAuth()
  @ApiResponse({
    status: 200,
    description: 'Role updated',
    schema: {
      example: {
        id: 'uuid',
        email: 'support@example.com',
        role: 'FRAUD_OFFICER',
      },
    },
  })
  async updateRole(
    @Param('adminId') adminId: string,
    @Body() body: { role: string },
  ) {
    return this.adminService.updateRole(adminId, body.role as any);
  }

  /**
   * Deactivate admin
   * Requires ADMIN_USERS_DELETE permission
   */
  @Post(':adminId/deactivate')
  @AdminAuth()
  @AdminPermission(ADMIN_PERMISSIONS.ADMIN_USERS_DELETE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Deactivate admin',
    description: 'Disable admin account (soft delete)',
  })
  @ApiBearerAuth()
  @ApiResponse({ status: 200, description: 'Admin deactivated' })
  async deactivateAdmin(@Param('adminId') adminId: string) {
    return this.adminService.deactivateAdmin(adminId);
  }

  /**
   * Activate admin
   * Requires ADMIN_USERS_DELETE permission
   */
  @Post(':adminId/activate')
  @AdminAuth()
  @AdminPermission(ADMIN_PERMISSIONS.ADMIN_USERS_DELETE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Activate admin',
    description: 'Re-enable previously deactivated admin account',
  })
  @ApiBearerAuth()
  @ApiResponse({ status: 200, description: 'Admin activated' })
  async activateAdmin(@Param('adminId') adminId: string) {
    return this.adminService.activateAdmin(adminId);
  }
}
