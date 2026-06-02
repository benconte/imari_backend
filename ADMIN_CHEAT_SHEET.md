# Admin Access Cheat Sheet

## 3-Step Integration

### Step 1: Import
```typescript
import { AdminAuth, AdminPermission, ADMIN_PERMISSIONS } from '@modules/admin';
import { Req } from '@nestjs/common';
```

### Step 2: Add Decorators
```typescript
@Post('wallets/:id/freeze')
@AdminAuth()  // ← JWT validation
@AdminPermission(ADMIN_PERMISSIONS.WALLETS_FREEZE)  // ← Permission check
async freezeWallet(@Param('id') id: string, @Req() req: any) {
  // ... handler code
}
```

### Step 3: Use Admin Context
```typescript
const admin = req.user;
// {
//   id: 'uuid',
//   email: 'admin@imari.com',
//   role: 'OPS_ADMIN',
//   permissions: ['transactions:reverse'],
//   firstName: 'Admin',
//   lastName: 'User'
// }
```

---

## Real Example: Freeze Wallet Route

```typescript
import { Controller, Post, Param, Body, Req, HttpCode, HttpStatus } from '@nestjs/common';
import { AdminAuth, AdminPermission, ADMIN_PERMISSIONS } from '@modules/admin';

@Controller('wallets')
export class WalletController {
  
  @Post(':id/admin/freeze')
  @AdminAuth()  // ← Step 1: Validate admin JWT
  @AdminPermission(ADMIN_PERMISSIONS.WALLETS_FREEZE)  // ← Step 2: Check permission
  @HttpCode(HttpStatus.OK)
  async freezeWallet(
    @Param('id') walletId: string,
    @Body() body: { reason: string },
    @Req() req: any,  // ← Step 3: Get admin from request
  ) {
    const admin = req.user;
    
    // Log who did what
    console.log(`Admin ${admin.email} (${admin.role}) freezing wallet ${walletId}`);
    
    // Do the action
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
}
```

---

## Access Admin in Different Ways

### Method 1: Via @Req() (Recommended)
```typescript
async freezeWallet(@Req() req: any) {
  const admin = req.user;  // AdminUser object
  console.log(admin.email);
}
```

### Method 2: Custom Decorator (Cleaner)
```typescript
// Create decorator
import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const Admin = createParamDecorator(
  (data, ctx: ExecutionContext) => ctx.switchToHttp().getRequest().user
);

// Use it
async freezeWallet(@Admin() admin: any) {
  console.log(admin.email);
}
```

### Method 3: Via Service (With Audit)
```typescript
// In controller
async freezeWallet(@Param('id') walletId: string, @Req() req: any) {
  return this.walletService.freezeWallet(walletId, req.user);
}

// In service
async freezeWallet(walletId: string, admin: { id: string; email: string }) {
  const result = await this.prisma.wallet.update({
    where: { id: walletId },
    data: { isLocked: true },
  });
  
  // Audit
  await this.auditService.log({ action: 'FROZEN', adminId: admin.id });
  
  return result;
}
```

---

## Permission Decorator Modes

### Single Permission
```typescript
@AdminPermission(ADMIN_PERMISSIONS.WALLETS_FREEZE)
// ✓ Admin with wallets:freeze
// ✗ Admin without it
```

### Multiple Permissions (ANY mode - default)
```typescript
@AdminPermission([
  ADMIN_PERMISSIONS.WALLETS_FREEZE,
  ADMIN_PERMISSIONS.WALLETS_UNFREEZE,
])
// ✓ Admin with wallets:freeze
// ✓ Admin with wallets:unfreeze
// ✗ Admin with neither
```

### Multiple Permissions (ALL mode)
```typescript
@AdminPermission(
  [ADMIN_PERMISSIONS.TRANSACTIONS_REVERSE, ADMIN_PERMISSIONS.AUDIT_READ],
  'ALL'  // ← Must have BOTH
)
// ✓ Admin with transactions:reverse AND audit:read
// ✗ Admin with only transactions:reverse (missing audit:read)
```

---

## Common Patterns

### Pattern: Admin Reads Data
```typescript
@Get('wallets/:id')
@AdminAuth()  // ← Authentication only
// No @AdminPermission() = all admins can access
async getWalletDetails(@Param('id') id: string) {
  return this.walletService.getWallet(id);
}
```

### Pattern: Admin Modifies Data
```typescript
@Post('wallets/:id/freeze')
@AdminAuth()
@AdminPermission(ADMIN_PERMISSIONS.WALLETS_FREEZE)
async freezeWallet(@Param('id') id: string, @Req() req: any) {
  const result = await this.walletService.freeze(id);
  await this.auditService.log({
    action: 'FROZEN',
    adminId: req.user.id,
  });
  return result;
}
```

### Pattern: Multi-Step Operation
```typescript
@Post('transactions/:id/reverse')
@AdminAuth()
@AdminPermission(
  [ADMIN_PERMISSIONS.TRANSACTIONS_REVERSE, ADMIN_PERMISSIONS.AUDIT_READ],
  'ALL'  // Needs both perms
)
async reverseTransaction(@Param('id') id: string, @Req() req: any) {
  // Step 1: Verify can read audit (implicit in permission check)
  const auditTrail = await this.auditService.getTransaction(id);
  
  // Step 2: Reverse
  const result = await this.transactionService.reverse(id);
  
  // Step 3: Log
  await this.auditService.log({
    action: 'REVERSED',
    adminId: req.user.id,
    original: auditTrail,
  });
  
  return result;
}
```

---

## Testing: Manual Steps

```bash
# 1. Seed admin user (in prisma/seed.ts)
const admin = await prisma.adminUser.create({
  data: {
    email: 'admin@imari.com',
    passwordHash: await argon2.hash('SecurePassword123!'),
    firstName: 'Admin',
    lastName: 'User',
    role: 'OPS_ADMIN',
    permissions: [],
  },
});
```

```bash
# 2. Run seed
npm run prisma:seed
```

```bash
# 3. Get admin token
TOKEN=$(curl -s http://localhost:3000/api/v1/admin/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@imari.com","password":"SecurePassword123!"}' \
  | jq -r '.accessToken')

echo $TOKEN
```

```bash
# 4. Call admin route
curl http://localhost:3000/api/v1/admin/me \
  -H "Authorization: Bearer $TOKEN" | jq .
```

```bash
# 5. Call protected endpoint
curl -X POST http://localhost:3000/wallets/wallet-id/admin/freeze \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"reason":"Suspicious"}' | jq .
```

---

## Error Responses

```json
// 401 Unauthorized - Invalid/missing JWT
{
  "statusCode": 401,
  "message": "Admin authentication failed. Invalid or expired token."
}

// 403 Forbidden - Insufficient permissions
{
  "statusCode": 403,
  "message": "Insufficient permissions. Required: wallets:freeze (mode: ANY)"
}

// 404 Not Found - Resource doesn't exist
{
  "statusCode": 404,
  "message": "Wallet not found"
}
```

---

## Admin Object in req.user

```typescript
req.user = {
  id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  email: 'admin@imari.com',
  role: 'OPS_ADMIN',                  // Role name
  permissions: [                       // Extra permissions
    'transactions:reverse',
    'transactions:refund'
  ],
  firstName: 'Admin',
  lastName: 'User'
};

// Use in routes
req.user.id           // Admin UUID for audit logs
req.user.email        // For logging/notifications
req.user.role         // Check baseline role
req.user.permissions  // Check extra permissions (rarely needed)
```

---

## Workflow: Grant Temporary Permission

```bash
# 1. Support agent normally has SUPPORT role
# Permissions = support:notes_add, audit:read, ...

# 2. During incident, grant extra permission
curl -X PATCH http://localhost:3000/api/v1/admin/support-agent-id/permissions \
  -H "Authorization: Bearer $SUPER_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"permissions":["transactions:reverse","transactions:refund"]}'

# 3. Support agent can now reverse transactions
# Effective = SUPPORT perms + transactions:reverse + transactions:refund

# 4. After incident, revoke
curl -X PATCH http://localhost:3000/api/v1/admin/support-agent-id/permissions \
  -H "Authorization: Bearer $SUPER_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"permissions":[]}'

# 5. Back to normal SUPPORT permissions
```

---

## Commonly Used Patterns

| Pattern | Code |
|---------|------|
| **Get admin email** | `req.user.email` |
| **Get admin ID** | `req.user.id` |
| **Get admin role** | `req.user.role` |
| **Log admin action** | `{ adminId: req.user.id, adminEmail: req.user.email, action: '...' }` |
| **Pass to service** | `this.service.method(id, req.user)` |
| **Check permission** | `@AdminPermission(ADMIN_PERMISSIONS.WALLETS_FREEZE)` |
| **Multiple permissions** | `@AdminPermission([perm1, perm2])` |
| **All permissions** | `@AdminPermission([perm1, perm2], 'ALL')` |
