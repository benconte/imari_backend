# How to Access Admin in Your Endpoint Routes

Complete guide to integrate admin authentication & authorization into your existing controllers and services.

---

## Quick Start

### Step 1: Import Admin Decorators

```typescript
import { AdminAuth, AdminPermission, ADMIN_PERMISSIONS } from '@modules/admin';
```

### Step 2: Add Decorators to Route

```typescript
@Post('wallets/:id/freeze')
@AdminAuth()  // ← Validates admin JWT
@AdminPermission(ADMIN_PERMISSIONS.WALLETS_FREEZE)  // ← Checks permission
async freezeWallet(@Param('id') walletId: string, @Req() req: any) {
  console.log(req.user);  // Admin object with id, email, role, permissions
  // ... implement route
}
```

### Step 3: Use Admin Context

```typescript
// req.user contains:
{
  id: 'admin-uuid',
  email: 'admin@imari.com',
  role: 'OPS_ADMIN',
  permissions: ['transactions:reverse'],
  firstName: 'Admin',
  lastName: 'User',
}
```

---

## Pattern 1: Access Admin in Route Handler

### Without @Req()

```typescript
import { Req, Request } from '@nestjs/common';

@Post('wallets/:id/freeze')
@AdminAuth()
@AdminPermission(ADMIN_PERMISSIONS.WALLETS_FREEZE)
async freezeWallet(
  @Param('id') walletId: string,
  @Req() req: Request,  // ← Inject Request
) {
  // Access admin from req.user
  const admin = req.user;
  
  console.log(`Admin ${admin.email} freezing wallet ${walletId}`);
  
  return this.walletService.freezeWallet(walletId, admin);
}
```

### Custom Decorator (Optional)

```typescript
// src/common/decorators/admin.decorator.ts
import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const Admin = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;  // Returns admin object
  },
);
```

Then use it:
```typescript
@Post('wallets/:id/freeze')
@AdminAuth()
@AdminPermission(ADMIN_PERMISSIONS.WALLETS_FREEZE)
async freezeWallet(
  @Param('id') walletId: string,
  @Admin() admin: any,  // ← Cleaner!
) {
  console.log(`Admin ${admin.email} freezing wallet ${walletId}`);
  return this.walletService.freezeWallet(walletId, admin);
}
```

---

## Pattern 2: Admin Routes in Wallet Controller

### Add Admin Endpoints to Existing Wallet Controller

```typescript
// src/modules/wallet/wallet.controller.ts

import { AdminAuth, AdminPermission, ADMIN_PERMISSIONS } from '@modules/admin';

@ApiTags('wallet')
@Controller('wallet')
export class WalletController {
  constructor(
    private readonly walletService: WalletService,
    private readonly auditService: AuditService,
  ) {}

  // ============================================================
  // USER ENDPOINTS (existing)
  // ============================================================

  @Post()
  @UseGuards(JwtAuthGuard)
  async createWallet(@CurrentUser() user: AuthUser, @Body() dto: CreateWalletDto) {
    return this.walletService.createWallet(user.userId, dto.currency);
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  async getWallets(@CurrentUser() user: AuthUser) {
    return this.walletService.getWallets(user.userId);
  }

  // ============================================================
  // ADMIN ENDPOINTS (new)
  // ============================================================

  /**
   * Admin: Freeze wallet
   * Only OPS_ADMIN and FRAUD_OFFICER can freeze
   */
  @Post(':id/admin/freeze')
  @AdminAuth()
  @AdminPermission(ADMIN_PERMISSIONS.WALLETS_FREEZE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '[ADMIN] Freeze wallet' })
  @ApiBearerAuth()
  async adminFreezeWallet(
    @Param('id') walletId: string,
    @Body() body: { reason: string },
    @Req() req: any,
  ) {
    const admin = req.user;
    
    // Execute action
    const result = await this.walletService.freezeWallet(walletId, body.reason);
    
    // Audit log
    await this.auditService.log({
      action: 'WALLET_FROZEN',
      adminId: admin.id,
      adminEmail: admin.email,
      targetWalletId: walletId,
      reason: body.reason,
    });
    
    return result;
  }

  /**
   * Admin: Unfreeze wallet
   * Only OPS_ADMIN can unfreeze (and must be able to read audit)
   */
  @Post(':id/admin/unfreeze')
  @AdminAuth()
  @AdminPermission(
    [ADMIN_PERMISSIONS.WALLETS_UNFREEZE, ADMIN_PERMISSIONS.AUDIT_READ],
    'ALL'  // ← Requires BOTH permissions
  )
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '[ADMIN] Unfreeze wallet' })
  @ApiBearerAuth()
  async adminUnfreezeWallet(
    @Param('id') walletId: string,
    @Body() body: { reason: string },
    @Req() req: any,
  ) {
    const admin = req.user;
    
    const result = await this.walletService.unfreezeWallet(walletId, body.reason);
    
    await this.auditService.log({
      action: 'WALLET_UNFROZEN',
      adminId: admin.id,
      adminEmail: admin.email,
      targetWalletId: walletId,
      reason: body.reason,
    });
    
    return result;
  }

  /**
   * Admin: Adjust wallet limits
   * Multiple permissions (ANY mode - requires at least one)
   */
  @Patch(':id/admin/limit')
  @AdminAuth()
  @AdminPermission([
    ADMIN_PERMISSIONS.WALLETS_ADJUST_LIMIT,
    ADMIN_PERMISSIONS.WALLETS_FREEZE,
  ])
  @ApiOperation({ summary: '[ADMIN] Adjust wallet limits' })
  @ApiBearerAuth()
  async adminAdjustLimit(
    @Param('id') walletId: string,
    @Body() body: { dailyLimit: number; monthlyLimit: number },
    @Req() req: any,
  ) {
    const admin = req.user;
    
    const result = await this.walletService.adjustLimits(
      walletId,
      body.dailyLimit,
      body.monthlyLimit,
    );
    
    await this.auditService.log({
      action: 'WALLET_LIMITS_ADJUSTED',
      adminId: admin.id,
      adminEmail: admin.email,
      targetWalletId: walletId,
      newLimits: body,
    });
    
    return result;
  }

  /**
   * Admin: Get wallet details (read-only)
   * All admin roles can read wallet details
   */
  @Get(':id/admin/details')
  @AdminAuth()
  // No @AdminPermission() = all authenticated admins can read
  @ApiOperation({ summary: '[ADMIN] Get wallet details' })
  @ApiBearerAuth()
  async adminGetWalletDetails(
    @Param('id') walletId: string,
    @Req() req: any,
  ) {
    const admin = req.user;
    
    const wallet = await this.walletService.getWalletDetails(walletId);
    
    await this.auditService.log({
      action: 'WALLET_DETAILS_VIEWED',
      adminId: admin.id,
      adminEmail: admin.email,
      targetWalletId: walletId,
    });
    
    return wallet;
  }
}
```

---

## Pattern 3: Admin Service Wrapper

### Create Admin-Specific Service Methods

```typescript
// src/modules/wallet/wallet.service.ts

import { Injectable, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '@common/prisma/prisma.service';
import { AuditService } from '@modules/audit/audit.service';

@Injectable()
export class WalletService {
  constructor(
    private prisma: PrismaService,
    private auditService: AuditService,
  ) {}

  // ============================================================
  // USER METHODS
  // ============================================================

  async createWallet(userId: string, currency: string) {
    // ... existing user wallet creation
  }

  // ============================================================
  // ADMIN METHODS
  // ============================================================

  /**
   * Admin-only: Freeze wallet
   * Called from admin controller route
   * 
   * @param walletId - Wallet to freeze
   * @param reason - Reason for freeze (audit log)
   * @param admin - Admin object { id, email, role }
   */
  async adminFreezeWallet(
    walletId: string,
    reason: string,
    admin: { id: string; email: string; role: string },
  ) {
    // Verify wallet exists
    const wallet = await this.prisma.wallet.findUnique({
      where: { id: walletId },
    });

    if (!wallet) {
      throw new NotFoundException('Wallet not found');
    }

    // Perform freeze
    const updated = await this.prisma.wallet.update({
      where: { id: walletId },
      data: { isLocked: true },
    });

    // Audit
    await this.auditService.logAdminAction({
      action: 'WALLET_FROZEN',
      admin,
      target: { type: 'WALLET', id: walletId },
      reason,
    });

    return updated;
  }

  /**
   * Admin-only: Get all wallets (with user info)
   * Called from admin dashboard
   */
  async adminGetAllWallets(
    admin: { id: string; email: string; role: string },
    limit: number = 50,
    offset: number = 0,
  ) {
    const wallets = await this.prisma.wallet.findMany({
      take: limit,
      skip: offset,
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    await this.auditService.logAdminAction({
      action: 'ADMIN_WALLETS_LISTED',
      admin,
    });

    return wallets;
  }

  /**
   * Admin-only: Get wallet transactions (admin view)
   */
  async adminGetWalletTransactions(
    walletId: string,
    admin: { id: string; email: string; role: string },
    limit: number = 100,
  ) {
    const transactions = await this.prisma.transaction.findMany({
      where: {
        OR: [
          { senderWalletId: walletId },
          { receiverWalletId: walletId },
        ],
      },
      take: limit,
      orderBy: { createdAt: 'desc' },
    });

    await this.auditService.logAdminAction({
      action: 'ADMIN_WALLET_TRANSACTIONS_VIEWED',
      admin,
      target: { type: 'WALLET', id: walletId },
    });

    return transactions;
  }
}
```

---

## Pattern 4: Separate Admin Controller

### Option: Create Dedicated Admin Wallet Controller

```typescript
// src/modules/wallet/admin-wallet.controller.ts

import { Controller, Get, Post, Param, Body, Query, Req, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { AdminAuth, AdminPermission, ADMIN_PERMISSIONS } from '@modules/admin';
import { WalletService } from './wallet.service';
import { AuditService } from '@modules/audit/audit.service';

/**
 * Admin Wallet Controller
 * Separate from user wallet routes
 * All routes require admin authentication + permissions
 */
@ApiTags('Admin / Wallet Management')
@Controller('api/v1/admin/wallets')
export class AdminWalletController {
  constructor(
    private walletService: WalletService,
    private auditService: AuditService,
  ) {}

  /**
   * List all wallets with user info
   * Requires: wallets:read permission
   */
  @Get()
  @AdminAuth()
  @AdminPermission(ADMIN_PERMISSIONS.WALLETS_READ)
  @ApiOperation({ summary: 'List all wallets' })
  @ApiBearerAuth()
  @ApiResponse({ status: 200, description: 'List of wallets' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  async listWallets(
    @Query('limit') limit: number = 50,
    @Query('offset') offset: number = 0,
    @Req() req: any,
  ) {
    return this.walletService.adminGetAllWallets(req.user, limit, offset);
  }

  /**
   * Get wallet details
   * Requires: wallets:read permission
   */
  @Get(':id')
  @AdminAuth()
  @AdminPermission(ADMIN_PERMISSIONS.WALLETS_READ)
  @ApiOperation({ summary: 'Get wallet details' })
  @ApiBearerAuth()
  async getWalletDetails(
    @Param('id') walletId: string,
    @Req() req: any,
  ) {
    return this.walletService.adminGetWalletDetails(walletId, req.user);
  }

  /**
   * Get wallet transactions
   * Requires: transactions:read permission
   */
  @Get(':id/transactions')
  @AdminAuth()
  @AdminPermission(ADMIN_PERMISSIONS.TRANSACTIONS_READ)
  @ApiOperation({ summary: 'Get wallet transactions' })
  @ApiBearerAuth()
  async getTransactions(
    @Param('id') walletId: string,
    @Query('limit') limit: number = 100,
    @Req() req: any,
  ) {
    return this.walletService.adminGetWalletTransactions(walletId, req.user, limit);
  }

  /**
   * Freeze wallet
   * Requires: wallets:freeze permission
   */
  @Post(':id/freeze')
  @AdminAuth()
  @AdminPermission(ADMIN_PERMISSIONS.WALLETS_FREEZE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Freeze wallet' })
  @ApiBearerAuth()
  async freezeWallet(
    @Param('id') walletId: string,
    @Body() body: { reason: string },
    @Req() req: any,
  ) {
    return this.walletService.adminFreezeWallet(walletId, body.reason, req.user);
  }

  /**
   * Unfreeze wallet
   * Requires: wallets:unfreeze AND audit:read
   */
  @Post(':id/unfreeze')
  @AdminAuth()
  @AdminPermission(
    [ADMIN_PERMISSIONS.WALLETS_UNFREEZE, ADMIN_PERMISSIONS.AUDIT_READ],
    'ALL',
  )
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Unfreeze wallet' })
  @ApiBearerAuth()
  async unfreezeWallet(
    @Param('id') walletId: string,
    @Body() body: { reason: string },
    @Req() req: any,
  ) {
    return this.walletService.adminUnfreezeWallet(walletId, body.reason, req.user);
  }

  /**
   * Adjust wallet limits
   * Requires: wallets:adjust_limit permission
   */
  @Patch(':id/limit')
  @AdminAuth()
  @AdminPermission(ADMIN_PERMISSIONS.WALLETS_ADJUST_LIMIT)
  @ApiOperation({ summary: 'Adjust wallet limits' })
  @ApiBearerAuth()
  async adjustLimit(
    @Param('id') walletId: string,
    @Body() body: { dailyLimit: number; monthlyLimit: number },
    @Req() req: any,
  ) {
    return this.walletService.adminAdjustLimits(walletId, body, req.user);
  }
}
```

Then add to wallet.module.ts:
```typescript
import { AdminWalletController } from './admin-wallet.controller';

@Module({
  imports: [PrismaModule],
  controllers: [WalletController, AdminWalletController],  // ← Add here
  providers: [WalletService],
})
export class WalletModule {}
```

---

## Pattern 5: Access Admin in Services

### Pass Admin Object to Service Methods

```typescript
// src/modules/wallet/wallet.service.ts

@Injectable()
export class WalletService {
  constructor(
    private prisma: PrismaService,
    private auditService: AuditService,
  ) {}

  /**
   * Service method receives admin as parameter
   * Used for audit logging & permission validation
   */
  async freezeWallet(
    walletId: string,
    reason: string,
    admin?: { id: string; email: string; role: string },
  ) {
    // Only admins can freeze wallets
    if (!admin) {
      throw new ForbiddenException('Only admins can freeze wallets');
    }

    const wallet = await this.prisma.wallet.findUnique({
      where: { id: walletId },
    });

    if (!wallet) {
      throw new NotFoundException('Wallet not found');
    }

    const updated = await this.prisma.wallet.update({
      where: { id: walletId },
      data: { isLocked: true },
    });

    // Log admin action
    console.log(`Admin ${admin.email} froze wallet ${walletId}: ${reason}`);

    await this.auditService.log({
      action: 'WALLET_FROZEN',
      adminId: admin.id,
      adminEmail: admin.email,
      targetWalletId: walletId,
      reason,
    });

    return updated;
  }
}
```

---

## Complete Example: User Controller with Admin Routes

```typescript
// src/modules/auth/admin-user.controller.ts

import { Controller, Get, Patch, Post, Param, Body, Query, Req, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { AdminAuth, AdminPermission, ADMIN_PERMISSIONS } from '@modules/admin';
import { UserService } from './user.service';

@ApiTags('Admin / User Management')
@Controller('api/v1/admin/users')
export class AdminUserController {
  constructor(private userService: UserService) {}

  /**
   * List all users
   * Requires: users:read permission
   */
  @Get()
  @AdminAuth()
  @AdminPermission(ADMIN_PERMISSIONS.USERS_READ)
  @ApiOperation({ summary: 'List all users' })
  @ApiBearerAuth()
  async listUsers(
    @Query('limit') limit: number = 50,
    @Query('offset') offset: number = 0,
    @Req() req: any,
  ) {
    console.log(`Admin ${req.user.email} listing users`);
    return this.userService.getAllUsers(limit, offset, req.user);
  }

  /**
   * Get user details
   * Requires: users:read permission
   */
  @Get(':id')
  @AdminAuth()
  @AdminPermission(ADMIN_PERMISSIONS.USERS_READ)
  @ApiOperation({ summary: 'Get user details' })
  @ApiBearerAuth()
  async getUser(
    @Param('id') userId: string,
    @Req() req: any,
  ) {
    console.log(`Admin ${req.user.email} viewing user ${userId}`);
    return this.userService.getUserDetails(userId, req.user);
  }

  /**
   * Suspend user
   * Requires: users:suspend permission
   */
  @Post(':id/suspend')
  @AdminAuth()
  @AdminPermission(ADMIN_PERMISSIONS.USERS_SUSPEND)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Suspend user account' })
  @ApiBearerAuth()
  async suspendUser(
    @Param('id') userId: string,
    @Body() body: { reason: string },
    @Req() req: any,
  ) {
    console.log(`Admin ${req.user.email} suspending user ${userId}: ${body.reason}`);
    return this.userService.suspendUser(userId, body.reason, req.user);
  }

  /**
   * Verify KYC
   * Requires: kyc:approve permission
   */
  @Post(':id/kyc/approve')
  @AdminAuth()
  @AdminPermission(ADMIN_PERMISSIONS.KYC_APPROVE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Approve KYC' })
  @ApiBearerAuth()
  async approveKyc(
    @Param('id') userId: string,
    @Body() body: { tier: string },
    @Req() req: any,
  ) {
    console.log(`Admin ${req.user.email} approving KYC for user ${userId}`);
    return this.userService.verifyKyc(userId, body.tier, req.user);
  }

  /**
   * Reset user password
   * Requires: users:reset_password permission
   */
  @Post(':id/reset-password')
  @AdminAuth()
  @AdminPermission(ADMIN_PERMISSIONS.USERS_RESET_PASSWORD)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reset user password' })
  @ApiBearerAuth()
  async resetPassword(
    @Param('id') userId: string,
    @Req() req: any,
  ) {
    console.log(`Admin ${req.user.email} resetting password for user ${userId}`);
    return this.userService.resetPassword(userId, req.user);
  }
}
```

---

## Testing Admin Routes

### Using cURL

```bash
# 1. Login as admin
ADMIN_TOKEN=$(curl -s -X POST http://localhost:3000/api/v1/admin/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@imari.com",
    "password": "SecurePassword123!"
  }' | jq -r '.accessToken')

echo "Token: $ADMIN_TOKEN"

# 2. Call admin wallet route
curl -X GET http://localhost:3000/api/v1/admin/wallets \
  -H "Authorization: Bearer $ADMIN_TOKEN"

# 3. Freeze wallet
curl -X POST http://localhost:3000/api/v1/admin/wallets/wallet-uuid/freeze \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"reason":"Suspicious activity"}'

# 4. Get user list
curl -X GET "http://localhost:3000/api/v1/admin/users?limit=10" \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

### Using Postman

1. **Create admin login request:**
   ```
   POST http://localhost:3000/api/v1/admin/login
   Body: {
     "email": "admin@imari.com",
     "password": "xxx"
   }
   ```
   Save `accessToken` to variable `{{admin_token}}`

2. **Create admin wallet freeze request:**
   ```
   POST http://localhost:3000/api/v1/admin/wallets/:id/freeze
   Authorization: Bearer {{admin_token}}
   Body: {
     "reason": "Suspicious activity"
   }
   ```

3. **Use in all admin requests:**
   ```
   Authorization: Bearer {{admin_token}}
   ```

---

## Admin Object Structure in Requests

```typescript
// Available in req.user after @AdminAuth()
interface AdminUser {
  id: string;                    // Admin UUID
  email: string;                 // Admin email
  role: 'SUPER_ADMIN' | 'OPS_ADMIN' | 'FRAUD_OFFICER' | 'SUPPORT' | 'READ_ONLY';
  permissions: string[];         // Extra permissions ['transactions:reverse', ...]
  firstName: string;
  lastName: string;
}

// In route handlers:
@Post('action')
@AdminAuth()
async someRoute(@Req() req: any) {
  const admin = req.user;  // ← This is the AdminUser object
  
  // Use admin details
  console.log(admin.id);           // UUID
  console.log(admin.email);        // Email
  console.log(admin.role);         // Role name
  console.log(admin.permissions);  // Array of permissions
  console.log(admin.firstName);    // First name
  console.log(admin.lastName);     // Last name
}
```

---

## Key Points

| Point | Details |
|-------|---------|
| **Import** | `import { AdminAuth, AdminPermission, ADMIN_PERMISSIONS } from '@modules/admin';` |
| **Route Protection** | `@AdminAuth()` validates JWT, `@AdminPermission()` checks permissions |
| **Access Admin** | `req.user` contains admin object (use `@Req()` or custom decorator) |
| **Audit Logging** | Always log admin actions: who, what, when, why |
| **Permission Modes** | `'ANY'` (default) = at least one, `'ALL'` = all required |
| **Separate Routes** | Admin routes at `/api/v1/admin/*` separate from user routes |
| **Pass to Services** | Pass admin object as parameter to services for audit logging |
| **Error Handling** | 401 = invalid/expired token, 403 = insufficient permissions |

---

## Checklist: Adding Admin Protection to Existing Routes

- [ ] Import admin decorators: `AdminAuth, AdminPermission, ADMIN_PERMISSIONS`
- [ ] Add `@AdminAuth()` decorator to route
- [ ] Add `@AdminPermission(ADMIN_PERMISSIONS.*)` with required permission
- [ ] Extract admin from `@Req() req: any` or custom decorator
- [ ] Pass admin object to service for audit logging
- [ ] Update service to accept admin parameter
- [ ] Test route with admin token from `POST /admin/login`
- [ ] Verify permissions via `GET /admin/me`
- [ ] Document route in Swagger with `@ApiOperation({ summary: '[ADMIN] ...' })`
