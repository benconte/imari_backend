import { constantTimeEquals } from '@common/utils/hash.util';

/**
 * Validates a Flutterwave webhook signature.
 *
 * Flutterwave sends the FLUTTERWAVE_WEBHOOK_HASH secret verbatim in the
 * `verif-hash` request header on every webhook delivery. We compare it
 * using constant-time equality to prevent timing-based side-channel attacks.
 *
 * Reference: https://developer.flutterwave.com/docs/integration-guides/webhooks
 *
 * @param incomingHash  Value of the `verif-hash` header from the request.
 * @param expectedHash  FLUTTERWAVE_WEBHOOK_HASH from environment config.
 * @returns `true` if the signature is valid, `false` otherwise.
 */
export function validateFlutterwaveSignature(
  incomingHash: string | undefined,
  expectedHash: string | undefined,
): boolean {
  if (!incomingHash || !expectedHash) return false;
  return constantTimeEquals(incomingHash, expectedHash);
}
