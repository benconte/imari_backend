import { customAlphabet } from 'nanoid';

// Omit confusing chars (0/O, 1/I/L)
const SAFE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const DIGITS = '0123456789';

const nanoSafe = customAlphabet(SAFE_ALPHABET, 10);
const nanoDigits = customAlphabet(DIGITS, 10);

/**
 * Transaction reference: IMR-TXN-XXXXXXXXXX
 */
export function generateTransactionRef(): string {
  return `IMR-TXN-${nanoSafe()}`;
}

/**
 * Wallet number: IMR-NNNNNNNNNN (digits only, easier to dictate)
 */
export function generateWalletNumber(): string {
  return `IMR-${nanoDigits()}`;
}

/**
 * Generic prefixed reference (e.g. for cards, vaults, beneficiaries).
 */
export function generateReference(prefix: string, length = 12): string {
  return `${prefix}-${customAlphabet(SAFE_ALPHABET, length)()}`;
}

/**
 * Short OTP code (digits only).
 */
export function generateOtpCode(length = 6): string {
  return customAlphabet(DIGITS, length)();
}

/**
 * Idempotency key for system-initiated transactions (e.g. cron jobs).
 */
export function generateSystemIdempotencyKey(scope: string): string {
  return `sys:${scope}:${nanoSafe()}`;
}
