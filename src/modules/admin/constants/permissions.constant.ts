/**
 * Admin Permissions Constants
 * Fine-grained permission keys for flexible authorization
 *
 * Format: "resource:action"
 * Wildcard: "*" grants all permissions
 */

export const ADMIN_PERMISSIONS = {
  // User Management
  USERS_READ: 'users:read',
  USERS_SUSPEND: 'users:suspend',
  USERS_VERIFY_KYC: 'users:verify_kyc',
  USERS_REJECT_KYC: 'users:reject_kyc',
  USERS_RESET_PASSWORD: 'users:reset_password',
  USERS_DELETE: 'users:delete',

  // Wallet Management
  WALLETS_READ: 'wallets:read',
  WALLETS_FREEZE: 'wallets:freeze',
  WALLETS_UNFREEZE: 'wallets:unfreeze',
  WALLETS_ADJUST_LIMIT: 'wallets:adjust_limit',

  // Transaction Management
  TRANSACTIONS_READ: 'transactions:read',
  TRANSACTIONS_REVERSE: 'transactions:reverse',
  TRANSACTIONS_REFUND: 'transactions:refund',
  TRANSACTIONS_MARK_SUSPECT: 'transactions:mark_suspect',

  // Fraud Management
  FRAUD_ALERTS_READ: 'fraud:read_alerts',
  FRAUD_ALERTS_RESOLVE: 'fraud:resolve_alerts',
  FRAUD_ALERTS_MARK_FALSE: 'fraud:mark_false_positive',

  // KYC & Compliance
  KYC_READ: 'kyc:read',
  KYC_REVIEW: 'kyc:review',
  KYC_APPROVE: 'kyc:approve',
  KYC_REJECT: 'kyc:reject',

  // Audit & Logs
  AUDIT_READ: 'audit:read',
  AUDIT_EXPORT: 'audit:export',

  // Admin Management
  ADMIN_USERS_READ: 'admin_users:read',
  ADMIN_USERS_CREATE: 'admin_users:create',
  ADMIN_USERS_UPDATE: 'admin_users:update',
  ADMIN_USERS_DELETE: 'admin_users:delete',
  ADMIN_USERS_MANAGE_PERMISSIONS: 'admin_users:manage_permissions',
  ADMIN_USERS_MANAGE_ROLES: 'admin_users:manage_roles',

  // System & Configuration
  SYSTEM_CONFIG_READ: 'system:config_read',
  SYSTEM_CONFIG_UPDATE: 'system:config_update',
  SYSTEM_HEALTH_READ: 'system:health_read',

  // Support
  SUPPORT_NOTES_ADD: 'support:notes_add',
  SUPPORT_NOTES_READ: 'support:notes_read',

  // Wildcard - grants everything
  ALL: '*',
} as const;

export type AdminPermissionKey = typeof ADMIN_PERMISSIONS[keyof typeof ADMIN_PERMISSIONS];
