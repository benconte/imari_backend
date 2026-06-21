import { Currency, Prisma } from '@prisma/client';

// ─── Flutterwave API Response Shapes ─────────────────────────────────────────
// Based on Flutterwave API v3: https://developer.flutterwave.com/docs

/**
 * Response from POST /auth/token (OAuth2 client-credentials flow).
 * Flutterwave now uses clientId + clientSecret to issue short-lived Bearer tokens.
 */
export interface FlwTokenResponse {
  status: string;
  message: string;
  data: {
    access_token: string;
    expires_in: number;   // seconds until expiry
    token_type: string;   // 'Bearer'
  };
}

export interface FlwInitializeResponse {
  status: string;   // 'success' | 'error'
  message: string;
  data: {
    link: string;   // Flutterwave hosted checkout URL
  };
}

export interface FlwCustomer {
  id: number;
  name: string;
  phone_number: string;
  email: string;
  created_at: string;
}

export interface FlwCardDetails {
  first_6digits: string;
  last_4digits: string;
  issuer: string;
  country: string;
  type: string;
  expiry: string;
}

export interface FlwVerifyData {
  id: number;
  tx_ref: string;          // Our internal transaction reference (IMR-TXN-...)
  flw_ref: string;         // Flutterwave's own reference
  device_fingerprint: string;
  amount: number;          // Amount the merchant receives (before fees applied)
  currency: string;
  charged_amount: number;  // Amount the customer was charged (may include FLW fee)
  app_fee: number;         // Flutterwave fee
  merchant_fee: number;
  processor_response: string;
  auth_model: string;
  ip: string;
  narration: string;
  status: string;          // 'successful' | 'failed' | 'pending'
  payment_type: string;    // 'card' | 'mobilemoney_rwanda' | 'bank_transfer'
  created_at: string;
  account_id: number;
  customer: FlwCustomer;
  card?: FlwCardDetails;
  meta?: Record<string, unknown>;
}

export interface FlwVerifyResponse {
  status: string;
  message: string;
  data: FlwVerifyData;
}

// ─── Inbound Webhook Payload ──────────────────────────────────────────────────
// Flutterwave POST-s this to your webhook URL after a payment.

export interface FlutterwaveWebhookPayload {
  event: string;  // e.g. 'charge.completed', 'transfer.completed'
  data: {
    id: number;
    tx_ref: string;
    flw_ref: string;
    amount: number;
    currency: string;
    charged_amount: number;
    app_fee: number;
    merchant_fee: number;
    status: string;         // 'successful' | 'failed'
    payment_type: string;
    processor_response: string;
    narration: string;
    ip: string;
    created_at: string;
    account_id: number;
    customer: FlwCustomer;
    card?: FlwCardDetails;
    meta?: Record<string, unknown>;
  };
}

// ─── Internal Result Types ────────────────────────────────────────────────────

export interface InitializePaymentResult {
  paymentLink: string;
  txRef: string;
  transactionId: string;
}

// Parameters passed to the atomic wallet-credit operation
export interface CreditWalletParams {
  transactionId: string;
  walletId: string;
  userId: string;
  amount: Prisma.Decimal;
  currency: Currency;
  flwTransactionId: string;
  flwRef: string;
  providerTransactionId?: string;
  webhookEventId: string;
  existingMetadata?: unknown;
  webhookPayload: FlutterwaveWebhookPayload;
}
