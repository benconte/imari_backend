import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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
  type: z.string().optional(),
  status: z.string().optional(),
  fromDate: z.string().datetime().optional(),
  toDate: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().uuid().optional(),
});

export type TransactionHistoryQuery = z.infer<typeof TransactionHistoryQuerySchema>;

/* ============================================================
   Swagger DTOs (for beautiful documentation only)
   These are NOT used for validation — only for Swagger UI.
   Follows the exact same pattern as auth/identity DTOs.
============================================================ */

export class SetPinDtoSwagger {
  @ApiProperty({
    example: '1234',
    description: 'Exactly 4 digits. This is your wallet transaction PIN.',
    minLength: 4,
    maxLength: 4,
  })
  pin: string;
}

export class ChangePinDtoSwagger {
  @ApiProperty({
    example: '1234',
    description: 'Your current 4-digit wallet PIN',
    minLength: 4,
    maxLength: 4,
  })
  oldPin: string;

  @ApiProperty({
    example: '5678',
    description: 'New 4-digit wallet PIN',
    minLength: 4,
    maxLength: 4,
  })
  newPin: string;
}

export class P2PTransferDtoSwagger {
  @ApiProperty({
    example: 'IMR-7465291357',
    description: 'Receiver wallet number (starts with IMR- followed by 10 digits)',
  })
  receiverWalletNumber: string;

  @ApiProperty({
    example: '5000',
    description: 'Amount to send (string, supports up to 4 decimal places)',
  })
  amount: string;

  @ApiProperty({
    example: 'RWF',
    enum: ['RWF', 'USD', 'KES', 'UGX', 'TZS', 'EUR'],
    description: 'Currency of the transfer',
  })
  currency: Currency;

  @ApiPropertyOptional({
    example: 'Monthly support',
    description: 'Optional description for the transaction',
    maxLength: 200,
  })
  description?: string;

  @ApiProperty({
    example: '1234',
    description: 'Your 4-digit wallet PIN (required for any fund movement)',
    minLength: 4,
    maxLength: 4,
  })
  pin: string;

  @ApiPropertyOptional({
    example: '550e8400-e29b-41d4-a716-446655440000',
    description: 'Optional idempotency key (UUID) for safe retries',
  })
  idempotencyKey?: string;
}
