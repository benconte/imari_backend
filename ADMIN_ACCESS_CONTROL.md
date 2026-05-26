# Admin Access Control System

## Overview

A comprehensive **two-layer access control system** for admin endpoints:

1. **Role-Based Access Control (RBAC)** — Coarse-grained baseline permissions
2. **Permission-Based Access Control (PBAC)** — Fine-grained override permissions

### Why Two Layers?

- **Roles are too coarse** — You can't grant specific permissions without creating new roles
- **Permissions alone are too granular** — You don't want to set every permission individually

**Solution:** Roles + Extra Permissions
```
Effective Permissions = ROLE_PERMISSIONS[role] ∪ admin.permissions[]
```

**Example:** Support agent needs temporary transaction reversal access during a pilot week
```
- Don't change role from SUPPORT to OPS_ADMIN (too much power)
- Just add "transactions:reverse" to admin.permissions[]
- After pilot week, remove it
```

---

## Default Role → Permissions Map

| Role | Permissions | Use Case |
|------|-----------|----------|
| **SUPER_ADMIN** | `*` (everything) | Founder/CTO — unrestricted access |
| **OPS_ADMIN** | User/wallet management, transaction reversal, audit read | Operations team — manage platform |
| **FRAUD_OFFICER** | Wallet freeze, fraud alerts, transaction marking | Fraud team — detect & prevent fraud |
| **SUPPORT** | User/wallet/transaction read, KYC read, support notes | Support team — help users, read-only + notes |
| **READ_ONLY** | Everything read-only, modify nothing | Auditors, compliance — read-only access |

### SUPER_ADMIN
```
• * (wildcard = everything)
```

### OPS_ADMIN
```
Read:
  • users:read
  • wallets:read
  • transactions:read
  • admin_users:read
  • audit:read

Manage:
  • users:suspend
  • wallets:freeze
  • wallets:unfreeze
  • wallets:adjust_limit
  • transactions:reverse
  • transactions:refund
```

### FRAUD_OFFICER
```
Read:
  • users:read
  • wallets:read
  • transactions:read
  • fraud:read_alerts
  • audit:read

Action:
  • wallets:freeze
  • fraud:resolve_alerts
  • fraud:mark_false_positive
  • transactions:mark_suspect
```

### SUPPORT
```
Read:
  • users:read
  • wallets:read
  • transactions:read
  • kyc:read
  • support:notes_read
  • audit:read

Action:
  • support:notes_add
```

### READ_ONLY
```
Read (modify nothing):
  • users:read
  • wallets:read
  • transactions:read
  • kyc:read
  • fraud:read_alerts
  • audit:read
  • admin_users:read
  • system:health_read
```

---

## Security Architecture

### Separate JWT Secret

User and admin tokens use **different secrets**:

```typescript
// User JWT
JWT_ACCESS_SECRET: 'user_secret_xxx'
JWT_REFRESH_SECRET: 'user_refresh_xxx'

// Admin JWT (separate boundary)
JWT_ADMIN_SECRET: 'admin_secret_xxx'
JWT_ADMIN_REFRESH_SECRET: 'admin_refresh_xxx'
```

**Why?** If user JWT secret leaks, admin endpoints stay safe. Different secret = different audience claim = different verification.

### Token Expiry

- **User Access Token:** 15 minutes
- **User Refresh Token:** 30 days
- **Admin Access Token:** 15 minutes ← Admins re-authenticate often
- **Admin Refresh Token:** 12 hours ← Shorter than user

---

## Implementation

### 1. Module Setup

```typescript
// src/modules/admin/admin.module.ts
@Module({
  imports: [PrismaModule, PassportModule, JwtModule.register({})],
  controllers: [AdminController],
  providers: [
    AdminService,
    AdminJwtStrategy,    // Validates admin JWT
    AdminAuthGuard,      // Checks authentication
    AdminPermissionGuard, // Checks permissions
  ],
  exports: [AdminService, AdminAuthGuard, AdminPermissionGuard],
})
export class AdminModule {}
```

Then import in `app.module.ts`:
```typescript
@Module({
  imports: [
    // ... other modules
    AdminModule,
  ],
})
export class AppModule {}
```

### 2. Database Schema

```prisma
model AdminUser {
  id          String     @id @default(uuid())
  email       String     @unique
  passwordHash String
  firstName   String
  lastName    String
  role        AdminRole  @default(SUPPORT)
  permissions String[]   @default([])    // Extra fine-grained permissions
  isActive    Boolean    @default(true)
  lastLoginAt DateTime?
  createdAt   DateTime   @default(now())
  updatedAt   DateTime   @updatedAt

  @@index([email])
  @@index([role])
  @@map("admin_users")
}

enum AdminRole {
  SUPER_ADMIN
  OPS_ADMIN
  FRAUD_OFFICER
  SUPPORT
  READ_ONLY
}
```

### 3. Protected Routes

```typescript
// src/modules/admin/admin.controller.ts

/**
 * List all admins
 * Requires: admin_users:read permission
 */
@Get()
@AdminAuth()  // ← Validates JWT
@AdminPermission(ADMIN_PERMISSIONS.ADMIN_USERS_READ)  // ← Checks permission
async listAdmins() {
  return this.adminService.getAllAdmins();
}

/**
 * Freeze wallet (multiple permissions)
 * Requires: ANY of (wallets:freeze)
 */
@Post('wallets/:walletId/freeze')
@AdminAuth()
@AdminPermission(ADMIN_PERMISSIONS.WALLETS_FREEZE)
async freezeWallet(@Param('walletId') walletId: string) {
  // ...
}

/**
 * Create transaction reversal (multiple steps)
 * Requires: ALL of (transactions:reverse + audit:read)
 */
@Post('transactions/:txnId/reverse')
@AdminAuth()
@AdminPermission(
  [ADMIN_PERMISSIONS.TRANSACTIONS_REVERSE, ADMIN_PERMISSIONS.AUDIT_READ],
  'ALL'
)
async reverseTransaction(@Param('txnId') txnId: string) {
  // ...
}
```

---

## Decorators & Guards

### @AdminAuth()

Validates admin JWT token. Must be applied to protected routes.

```typescript
@Get('me')
@AdminAuth()  // ← Protects with JWT validation
async getCurrentAdmin(@Req() req: any) {
  return req.user;  // Populated by AdminJwtStrategy
}
```

**What it does:**
1. Extracts Bearer token from `Authorization` header
2. Validates signature using `JWT_ADMIN_SECRET`
3. Verifies `audience: 'admin'` claim
4. Checks token expiry
5. Validates admin still exists and is active
6. Attaches admin object to `req.user`

### @AdminPermission()

Checks fine-grained permissions. Must come after `@AdminAuth()`.

```typescript
// Single permission (ANY mode - default)
@AdminPermission(ADMIN_PERMISSIONS.WALLETS_FREEZE)
async freezeWallet() { ... }

// Multiple permissions (ANY mode - requires at least one)
@AdminPermission([
  ADMIN_PERMISSIONS.WALLETS_FREEZE,
  ADMIN_PERMISSIONS.WALLETS_UNFREEZE,
])
async manageWallet() { ... }

// Multiple permissions (ALL mode - requires all)
@AdminPermission(
  [
    ADMIN_PERMISSIONS.TRANSACTIONS_REVERSE,
    ADMIN_PERMISSIONS.AUDIT_READ,
  ],
  'ALL'
)
async reverseTransaction() { ... }
```

**Permission Modes:**

| Mode | Meaning | Example |
|------|---------|---------|
| `'ANY'` (default) | Admin needs at least one permission | `wallets:freeze` OR `wallets:unfreeze` |
| `'ALL'` | Admin needs all permissions | `transactions:reverse` AND `audit:read` |

---

## Usage Examples

### Example 1: Support Agent with Extra Access

**Scenario:** Support agent needs temporary transaction reversal during incident response.

**Step 1:** Create support agent
```typescript
const admin = await prisma.adminUser.create({
  data: {
    email: 'support@imari.com',
    passwordHash: await argon2.hash('password123'),
    firstName: 'Support',
    lastName: 'Agent',
    role: AdminRole.SUPPORT,  // ← Role grants read-only access
    permissions: [],          // ← No extra permissions yet
  },
});
```

**Step 2:** Grant temporary permission
```typescript
// During incident
await adminService.updatePermissions(admin.id, [
  'transactions:reverse',    // ← Temporary extra permission
  'transactions:refund',
]);

// Effective permissions now = SUPPORT_PERMS ∪ {transactions:reverse, transactions:refund}
```

**Step 3:** Revoke after incident
```typescript
// After incident
await adminService.updatePermissions(admin.id, []);
// Back to normal SUPPORT permissions
```

### Example 2: Promote Fraud Officer to OPS_ADMIN

```typescript
// Before
admin.role = AdminRole.FRAUD_OFFICER
admin.permissions = []

// After promotion
await adminService.updateRole(admin.id, AdminRole.OPS_ADMIN);

// Effective permissions change from FRAUD_OFFICER to OPS_ADMIN
```

### Example 3: Wildcard Permission

```typescript
// Grant everything without changing role
await adminService.updatePermissions(admin.id, ['*']);

// Now admin has ALL permissions regardless of role
// Useful for: Temporary admin, emergency access, etc.
```

---

## API Endpoints

### Authentication

#### POST `/admin/login`
```bash
curl -X POST http://localhost:3000/api/v1/admin/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@imari.com",
    "password": "SecurePassword123!"
  }'
```

**Response:**
```json
{
  "accessToken": "eyJhbGc...",
  "refreshToken": "eyJhbGc...",
  "admin": {
    "id": "uuid",
    "email": "admin@imari.com",
    "firstName": "Admin",
    "lastName": "User",
    "role": "OPS_ADMIN"
  }
}
```

#### POST `/admin/refresh`
```bash
curl -X POST http://localhost:3000/api/v1/admin/refresh \
  -H "Content-Type: application/json" \
  -d '{
    "refreshToken": "eyJhbGc..."
  }'
```

**Response:**
```json
{
  "accessToken": "eyJhbGc..."
}
```

### Admin Management

#### GET `/admin/me`
```bash
curl http://localhost:3000/api/v1/admin/me \
  -H "Authorization: Bearer eyJhbGc..."
```

**Response:**
```json
{
  "id": "uuid",
  "email": "admin@imari.com",
  "firstName": "Admin",
  "lastName": "User",
  "role": "OPS_ADMIN",
  "permissions": ["transactions:reverse"],
  "effectivePermissions": [
    "users:read",
    "wallets:read",
    "transactions:read",
    "users:suspend",
    "wallets:freeze",
    "wallets:unfreeze",
    "wallets:adjust_limit",
    "transactions:reverse",
    "transactions:refund",
    "audit:read",
    "admin_users:read",
    "transactions:reverse"  // Extra
  ]
}
```

#### GET `/admin`
List all admins (requires `admin_users:read`)

#### GET `/admin/:adminId`
Get admin by ID

#### PATCH `/admin/:adminId/permissions`
```bash
curl -X PATCH http://localhost:3000/api/v1/admin/abc123/permissions \
  -H "Authorization: Bearer eyJhbGc..." \
  -H "Content-Type: application/json" \
  -d '{
    "permissions": ["transactions:reverse", "transactions:refund"]
  }'
```

#### PATCH `/admin/:adminId/role`
```bash
curl -X PATCH http://localhost:3000/api/v1/admin/abc123/role \
  -H "Authorization: Bearer eyJhbGc..." \
  -H "Content-Type: application/json" \
  -d '{
    "role": "FRAUD_OFFICER"
  }'
```

#### POST `/admin/:adminId/deactivate`
Disable admin account

#### POST `/admin/:adminId/activate`
Re-enable admin account

---

## Environment Variables

Required in `.env`:

```bash
# User JWT (existing)
JWT_ACCESS_SECRET=your_user_secret_at_least_32_chars_long_xxx
JWT_REFRESH_SECRET=your_user_refresh_secret_at_least_32_chars_xxx

# Admin JWT (new - separate boundary)
JWT_ADMIN_SECRET=your_admin_secret_at_least_32_chars_long_xxx
JWT_ADMIN_REFRESH_SECRET=your_admin_refresh_secret_at_least_32_chars_xxx
```

Generate secure secrets:
```bash
# macOS
openssl rand -base64 32

# Linux
head -c 32 /dev/urandom | base64

# Node.js
require('crypto').randomBytes(32).toString('hex')
```

---

## Permission Lookup

All available permissions in `src/modules/admin/constants/permissions.constant.ts`:

```typescript
ADMIN_PERMISSIONS = {
  // User Management
  USERS_READ: 'users:read',
  USERS_SUSPEND: 'users:suspend',
  USERS_VERIFY_KYC: 'users:verify_kyc',
  // ... etc
}
```

---

## Testing

### Postman Collection Example

```bash
# 1. Login as admin
POST /admin/login
Body: { "email": "admin@imari.com", "password": "xxx" }
Save accessToken to {{token}}

# 2. Get admin info with token
GET /admin/me
Authorization: Bearer {{token}}

# 3. List all admins (if you have permission)
GET /admin
Authorization: Bearer {{token}}

# 4. Update permissions
PATCH /admin/:adminId/permissions
Authorization: Bearer {{token}}
Body: { "permissions": ["transactions:reverse"] }

# 5. Refresh token
POST /admin/refresh
Body: { "refreshToken": "{{refreshToken}}" }
```

### cURL Examples

```bash
# Login
curl -X POST http://localhost:3000/api/v1/admin/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@imari.com","password":"xxx"}'

# Get self
curl http://localhost:3000/api/v1/admin/me \
  -H "Authorization: Bearer {{token}}"

# List admins
curl http://localhost:3000/api/v1/admin \
  -H "Authorization: Bearer {{token}}"

# Update role
curl -X PATCH http://localhost:3000/api/v1/admin/uuid/role \
  -H "Authorization: Bearer {{token}}" \
  -H "Content-Type: application/json" \
  -d '{"role":"FRAUD_OFFICER"}'

# Update permissions
curl -X PATCH http://localhost:3000/api/v1/admin/uuid/permissions \
  -H "Authorization: Bearer {{token}}" \
  -H "Content-Type: application/json" \
  -d '{"permissions":["transactions:reverse"]}'
```

---

## Troubleshooting

### "Admin authentication failed"
- Token is invalid or expired
- Admin account is deactivated
- Check that `Authorization: Bearer <token>` header is present

### "Insufficient permissions"
- Admin role doesn't grant required permission
- Extra permissions not added to `admin.permissions[]`
- Check effective permissions via GET `/admin/me`

### "JWT verification failed"
- Using wrong secret (user JWT vs admin JWT)
- Token audience doesn't match
- Check environment variables: `JWT_ADMIN_SECRET`, `JWT_ADMIN_REFRESH_SECRET`

---

## Best Practices

1. **Always use separate JWT secrets** — User ≠ Admin
2. **Grant minimum required permissions** — Don't over-privilege
3. **Rotate temporary permissions** — Add, then remove after incident
4. **Audit admin actions** — Log all permission changes
5. **Use roles as baseline** — Add extra perms only when needed
6. **Review active admins** — GET `/admin` to see current roster
7. **Short access token expiry** — 15min forces re-authentication
8. **Disable unused accounts** — POST `/admin/:id/deactivate`
9. **Document role assignments** — Who is OPS_ADMIN? Why?
10. **Test permission checks** — Verify guards block unauthorized requests
