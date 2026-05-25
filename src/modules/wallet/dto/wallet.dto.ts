import { z } from 'zod';
import { Currency } from '@prisma/client';

export const SetPinSchema = z.object({
  pin: z
    .string()
    .length(4, 'Wallet PIN must be exactly 4 digits')
    .regex(/^\d{4}$/, 'PIN must contain only digits'),
});

export type SetPinDto = z.infer<typeof SetPinSchema>;

export const ChangePinSchema = z.object({
  oldPin: z.string().length(4).regex(/^\d{4}$/),
  newPin: z
    .string()
    .length(4, 'Wallet PIN must be exactly 4 digits')
    .regex(/^\d{4}$/, 'PIN must contain only digits'),
});

export type ChangePinDto = z.infer<typeof ChangePinSchema>;

export const P2PTransferSchema = z.object({
  receiverWalletNumber: z
    .string()
    .regex(/^IMR-\d{10}$/, 'Receiver wallet number must be in format IMR- followed by 10 digits'),
  amount: z
    .string()
    .regex(/^\d+(\.\d{1,4})?$/, 'Amount must be a positive decimal with max 4 places'),
  currency: z.nativeEnum(Currency).default(Currency.RWF),
  description: z.string().max(200).optional(),
  idempotencyKey: z.string().uuid().optional(),
  pin: z.string().length(4).regex(/^\d{4}$/),
});

export type P2PTransferDto = z.infer<typeof P2PTransferSchema>;

export const TransactionHistoryQuerySchema = z.object({
  walletId: z.string().uuid().optional(),
  type: z.string().optional(), // comma separated or single
  status: z.string().optional(),
  fromDate: z.string().datetime().optional(),
  toDate: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().uuid().optional(), // for cursor pagination
});

export type TransactionHistoryQuery = z.infer<typeof TransactionHistoryQuerySchema>;
