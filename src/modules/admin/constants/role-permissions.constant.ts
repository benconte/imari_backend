import { AdminRole } from '@prisma/client';
import { ADMIN_PERMISSIONS, AdminPermissionKey } from './permissions.constant';

/**
 * Role-to-Permissions Mapping
 * Each role grants a baseline set of permissions
 * Effective permissions = ROLE_PERMISSIONS[role] ∪ admin.permissions[]
 */
export const ROLE_PERMISSIONS: Record<AdminRole, AdminPermissionKey[]> = {
  [AdminRole.SUPER_ADMIN]: [
    // Super admin can do everything
    ADMIN_PERMISSIONS.ALL,
  ],

  [AdminRole.OPS_ADMIN]: [
    // Read users, wallets, transactions
    ADMIN_PERMISSIONS.USERS_READ,
    ADMIN_PERMISSIONS.WALLETS_READ,
    ADMIN_PERMISSIONS.TRANSACTIONS_READ,
    // Manage wallets & users
    ADMIN_PERMISSIONS.USERS_SUSPEND,
    ADMIN_PERMISSIONS.WALLETS_FREEZE,
    ADMIN_PERMISSIONS.WALLETS_UNFREEZE,
    ADMIN_PERMISSIONS.WALLETS_ADJUST_LIMIT,
    // Transaction reversal & refunds
    ADMIN_PERMISSIONS.TRANSACTIONS_REVERSE,
    ADMIN_PERMISSIONS.TRANSACTIONS_REFUND,
    // Read audit logs
    ADMIN_PERMISSIONS.AUDIT_READ,
    // Admin management - read only
    ADMIN_PERMISSIONS.ADMIN_USERS_READ,
  ],

  [AdminRole.FRAUD_OFFICER]: [
    // Read users, wallets, transactions
    ADMIN_PERMISSIONS.USERS_READ,
    ADMIN_PERMISSIONS.WALLETS_READ,
    ADMIN_PERMISSIONS.TRANSACTIONS_READ,
    // Freeze wallets
    ADMIN_PERMISSIONS.WALLETS_FREEZE,
    // Manage fraud alerts
    ADMIN_PERMISSIONS.FRAUD_ALERTS_READ,
    ADMIN_PERMISSIONS.FRAUD_ALERTS_RESOLVE,
    ADMIN_PERMISSIONS.FRAUD_ALERTS_MARK_FALSE,
    // Mark transactions as suspect
    ADMIN_PERMISSIONS.TRANSACTIONS_MARK_SUSPECT,
    // Read audit logs
    ADMIN_PERMISSIONS.AUDIT_READ,
  ],

  [AdminRole.SUPPORT]: [
    // Read all user/wallet/transaction data
    ADMIN_PERMISSIONS.USERS_READ,
    ADMIN_PERMISSIONS.WALLETS_READ,
    ADMIN_PERMISSIONS.TRANSACTIONS_READ,
    // Read KYC info
    ADMIN_PERMISSIONS.KYC_READ,
    // Add support notes
    ADMIN_PERMISSIONS.SUPPORT_NOTES_ADD,
    ADMIN_PERMISSIONS.SUPPORT_NOTES_READ,
    // Read audit logs
    ADMIN_PERMISSIONS.AUDIT_READ,
  ],

  [AdminRole.READ_ONLY]: [
    // Read everything, modify nothing
    ADMIN_PERMISSIONS.USERS_READ,
    ADMIN_PERMISSIONS.WALLETS_READ,
    ADMIN_PERMISSIONS.TRANSACTIONS_READ,
    ADMIN_PERMISSIONS.KYC_READ,
    ADMIN_PERMISSIONS.FRAUD_ALERTS_READ,
    ADMIN_PERMISSIONS.AUDIT_READ,
    ADMIN_PERMISSIONS.ADMIN_USERS_READ,
    ADMIN_PERMISSIONS.SYSTEM_HEALTH_READ,
  ],
};

/**
 * Get effective permissions for an admin
 * = ROLE_PERMISSIONS[role] ∪ admin.permissions[]
 *
 * @param role - Admin role
 * @param extraPermissions - Additional permissions from AdminUser.permissions[]
 * @returns Set of effective permissions
 */
export function getEffectivePermissions(
  role: AdminRole,
  extraPermissions: string[] = [],
): Set<AdminPermissionKey> {
  const permissions = new Set<AdminPermissionKey>();

  // Add role-based permissions
  const rolePerms = ROLE_PERMISSIONS[role] || [];
  rolePerms.forEach((perm) => permissions.add(perm));

  // Add extra permissions from AdminUser.permissions[]
  extraPermissions.forEach((perm) => {
    if (perm === ADMIN_PERMISSIONS.ALL) {
      permissions.add(ADMIN_PERMISSIONS.ALL);
    } else if (isValidPermission(perm)) {
      permissions.add(perm as AdminPermissionKey);
    }
  });

  return permissions;
}

/**
 * Check if a permission string is valid
 */
function isValidPermission(permission: string): boolean {
  return Object.values(ADMIN_PERMISSIONS).includes(permission as AdminPermissionKey);
}

/**
 * Check if admin has required permission
 * Supports wildcard: "*" grants all permissions
 *
 * @param effectivePermissions - Set of admin's effective permissions
 * @param requiredPermission - Permission to check
 * @returns true if admin has permission
 */
export function hasPermission(
  effectivePermissions: Set<AdminPermissionKey>,
  requiredPermission: AdminPermissionKey,
): boolean {
  // Wildcard permission grants everything
  if (effectivePermissions.has(ADMIN_PERMISSIONS.ALL)) {
    return true;
  }

  return effectivePermissions.has(requiredPermission);
}

/**
 * Check if admin has any of the required permissions
 * Useful for endpoints requiring at least one of multiple perms
 *
 * @param effectivePermissions - Set of admin's effective permissions
 * @param requiredPermissions - Array of permissions (any one grants access)
 * @returns true if admin has at least one permission
 */
export function hasAnyPermission(
  effectivePermissions: Set<AdminPermissionKey>,
  requiredPermissions: AdminPermissionKey[],
): boolean {
  if (effectivePermissions.has(ADMIN_PERMISSIONS.ALL)) {
    return true;
  }

  return requiredPermissions.some((perm) => effectivePermissions.has(perm));
}

/**
 * Check if admin has all of the required permissions
 * Useful for endpoints requiring multiple specific perms
 *
 * @param effectivePermissions - Set of admin's effective permissions
 * @param requiredPermissions - Array of permissions (all must be granted)
 * @returns true if admin has all permissions
 */
export function hasAllPermissions(
  effectivePermissions: Set<AdminPermissionKey>,
  requiredPermissions: AdminPermissionKey[],
): boolean {
  if (effectivePermissions.has(ADMIN_PERMISSIONS.ALL)) {
    return true;
  }

  return requiredPermissions.every((perm) => effectivePermissions.has(perm));
}
