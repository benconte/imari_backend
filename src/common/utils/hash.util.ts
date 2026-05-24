import * as argon2 from 'argon2';
import { createHash, randomBytes, timingSafeEqual } from 'crypto';

/**
 * OWASP-recommended Argon2id parameters (memory 19 MiB, 2 iterations).
 * Tuned for ~50ms on modest hardware. Adjust upward as your servers improve.
 */
const ARGON_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
};

/**
 * Hash a high-value secret (password, wallet PIN, OTP code).
 * Use this only for secrets you'll later `verifySecret` against.
 */
export async function hashSecret(secret: string): Promise<string> {
  return argon2.hash(secret, ARGON_OPTIONS);
}

export async function verifySecret(
  hash: string,
  secret: string,
): Promise<boolean> {
  try {
    return await argon2.verify(hash, secret);
  } catch {
    return false;
  }
}

/**
 * Fast SHA-256. Use for non-secret-but-sensitive storage like refresh tokens,
 * webhook signatures, idempotency-key fingerprints. NOT for passwords.
 */
export function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

/**
 * Cryptographically random token (hex). Defaults to 32 bytes = 64 hex chars.
 */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('hex');
}

/**
 * Constant-time string comparison — use whenever comparing secrets or signatures
 * to prevent timing attacks.
 */
export function constantTimeEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
