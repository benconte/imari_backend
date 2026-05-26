# Admin Access Control - Quick Reference

## Roles Overview

```
┌─────────────────────────────────────────────────────────────┐
│                   ADMIN ROLES & PERMISSIONS                 │
├─────────────────┬────────────────────────────────────────────┤
│ SUPER_ADMIN     │ * (everything - wildcard)                  │
├─────────────────┼────────────────────────────────────────────┤
│ OPS_ADMIN       │ Users & wallets management, transactions   │
│                 │ - user:read, wallet:read, transaction:read │
│                 │ - user:suspend, wallet:freeze/unfreeze     │
│                 │ - transaction:reverse, transaction:refund  │
│                 │ - audit:read                               │
├─────────────────┼────────────────────────────────────────────┤
│ FRAUD_OFFICER   │ Fraud detection & wallet controls          │
│                 │ - user:read, wallet:read, transaction:read │
│                 │ - wallet:freeze                            │
│                 │ - fraud:read, fraud:resolve, mark_suspect  │
│                 │ - audit:read                               │
├─────────────────┼────────────────────────────────────────────┤
│ SUPPORT         │ User support & read-only access            │
│                 │ - user:read, wallet:read, transaction:read │
│                 │ - kyc:read                                 │
│                 │ - support:notes_add, support:notes_read    │
│                 │ - audit:read                               │
├─────────────────┼────────────────────────────────────────────┤
│ READ_ONLY       │ Everything read-only, no modifications     │
│                 │ - user:read, wallet:read, transaction:read │
│                 │ - kyc:read, fraud:read_alerts, audit:read  │
└─────────────────┴────────────────────────────────────────────┘
```

## Two-Layer Access Control

```
REQUEST → ROUTE HANDLER
   ↓
1. @AdminAuth()
   ├─ Extract Bearer token from Authorization header
   ├─ Verify JWT signature (JWT_ADMIN_SECRET)
   ├─ Check audience claim = 'admin'
   ├─ Verify expiry (15 min for access token)
   ├─ Validate admin still exists & isActive
   └─ Attach admin to req.user → PROCEED or REJECT (401)

   ↓

2. @AdminPermission('resource:action')
   ├─ Get admin from req.user
   ├─ Calculate effectivePermissions = ROLE_PERMISSIONS[role] ∪ admin.permissions[]
   ├─ Check if admin has required permission
   │  (or '*' wildcard = all permissions)
   └─ PROCEED or REJECT (403)

   ↓

HANDLER EXECUTES
Req.user contains:
{
  id: 'uuid',
  email: 'admin@imari.com',
  role: 'OPS_ADMIN',
  permissions: ['transactions:reverse'],
  firstName: 'Admin',
  lastName: 'User'
}
```

## Key Concepts

| Concept | Definition | Example |
|---------|-----------|---------|
| **Role** | Coarse-grained baseline permissions | SUPER_ADMIN, OPS_ADMIN, FRAUD_OFFICER |
| **Permission** | Fine-grained action | `wallets:freeze`, `kyc:review`, `audit:read` |
| **Extra Permission** | Permission added beyond role | Support agent with `transactions:reverse` during incident |
| **Effective Permissions** | Role perms + extra perms | OPS_ADMIN (has 10 perms) + `transactions:reverse` = 11 perms |
| **Wildcard** | `*` = grants everything | Temporary super-admin access |
| **Access Token** | Short-lived JWT (15min) | For API requests |
| **Refresh Token** | Long-lived JWT (12h) | For getting new access tokens |

## Usage Patterns

### Pattern 1: Protect with Single Permission

```typescript
@Post('wallets/:id/freeze')
@AdminAuth()
@AdminPermission('wallets:freeze')
async freezeWallet() { }
```

**Who can access:** Admin with `wallets:freeze` permission
- ✓ SUPER_ADMIN (has *)
- ✓ OPS_ADMIN (has wallets:freeze in role)
- ✓ FRAUD_OFFICER (has wallets:freeze in role)
- ✗ SUPPORT (doesn't have wallets:freeze)
- ✗ READ_ONLY (doesn't have wallets:freeze)

### Pattern 2: ANY of Multiple Permissions

```typescript
@Patch('wallets/:id/limit')
@AdminAuth()
@AdminPermission(['wallets:adjust_limit', 'wallets:freeze'])
async adjustLimit() { }
```

**Who can access:** Admin with at least ONE permission
- Requires: `wallets:adjust_limit` OR `wallets:freeze`

### Pattern 3: ALL Permissions Required

```typescript
@Post('transactions/:id/reverse')
@AdminAuth()
@AdminPermission(
  ['transactions:reverse', 'audit:read'],
  'ALL'
)
async reverseTransaction() { }
```

**Who can access:** Admin with ALL permissions
- Requires: `transactions:reverse` AND `audit:read`

### Pattern 4: Authentication Only (No Permission Check)

```typescript
@Get('me')
@AdminAuth()
// No @AdminPermission() = all admins can access
async getCurrentAdmin() { }
```

**Who can access:** Any authenticated admin

## Common Workflows

### Grant Temporary Permission

```typescript
// Emergency: Support agent needs to reverse transactions
await adminService.updatePermissions(adminId, [
  'transactions:reverse',
  'transactions:refund',
]);

// ... incident resolved ...

// Revoke temporary permissions
await adminService.updatePermissions(adminId, []);
```

### Promote Admin

```typescript
// Upgrade from SUPPORT to OPS_ADMIN
await adminService.updateRole(adminId, 'OPS_ADMIN');
```

### Disable Account

```typescript
// Offboarded employee
await adminService.deactivateAdmin(adminId);
```

## Environment Variables

```bash
# Separate JWT secrets (user ≠ admin)
JWT_ACCESS_SECRET=<32+ chars>
JWT_REFRESH_SECRET=<32+ chars>

JWT_ADMIN_SECRET=<32+ chars>           # Different from user JWT
JWT_ADMIN_REFRESH_SECRET=<32+ chars>   # Different from user JWT
```

## Common Errors

| Error | Cause | Fix |
|-------|-------|-----|
| 401 Unauthorized | Token invalid/expired | Check token, login again, refresh if needed |
| 403 Forbidden | Insufficient permissions | Check role + extra permissions, update if needed |
| Invalid audience | Using user JWT on admin endpoint | Use admin JWT (separate secret) |
| Admin not found | Account deactivated or deleted | Reactivate or create new admin |

## API Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/admin/login` | Authenticate admin, get tokens |
| POST | `/admin/refresh` | Get new access token |
| GET | `/admin/me` | Get current admin profile |
| GET | `/admin` | List all admins |
| GET | `/admin/:id` | Get admin by ID |
| PATCH | `/admin/:id/role` | Change admin role |
| PATCH | `/admin/:id/permissions` | Add/remove extra permissions |
| POST | `/admin/:id/deactivate` | Disable admin |
| POST | `/admin/:id/activate` | Enable admin |

## Permission List

```
User Management
  users:read, users:suspend, users:verify_kyc, users:reject_kyc,
  users:reset_password, users:delete

Wallet Management
  wallets:read, wallets:freeze, wallets:unfreeze, wallets:adjust_limit

Transaction Management
  transactions:read, transactions:reverse, transactions:refund,
  transactions:mark_suspect

Fraud Management
  fraud:read_alerts, fraud:resolve_alerts, fraud:mark_false_positive

KYC & Compliance
  kyc:read, kyc:review, kyc:approve, kyc:reject

Audit & Logs
  audit:read, audit:export

Admin Management
  admin_users:read, admin_users:create, admin_users:update,
  admin_users:delete, admin_users:manage_permissions,
  admin_users:manage_roles

System & Configuration
  system:config_read, system:config_update, system:health_read

Support
  support:notes_add, support:notes_read

Wildcard
  * (grants everything)
```

---

**📚 Full Documentation:** See `ADMIN_ACCESS_CONTROL.md`
**🚀 Implementation Guide:** See `ADMIN_IMPLEMENTATION_GUIDE.md`
