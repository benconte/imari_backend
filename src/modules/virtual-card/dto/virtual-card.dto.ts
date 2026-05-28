import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { z } from 'zod';
import { Currency } from '@prisma/client';
import { VirtualCardType, VirtualCardStatus } from '@prisma/client';

/* Create Virtual Card DTO */
export const CreateVirtualCardSchema = z.object({
  walletId: z.string().uuid(),
  type: z.nativeEnum(VirtualCardType).default(VirtualCardType.MULTI_USE),
  currency: z.nativeEnum(Currency),
  spendingLimit: z.string().regex(/^\d+(\.\d{1,4})?$/).optional(),
  dailyLimit: z.string().regex(/^\d+(\.\d{1,4})?$/).optional(),
  allowOnline: z.boolean().default(true),
  allowInternational: z.boolean().default(false),
  blockedMccs: z.array(z.string()).optional(),
  allowedMerchants: z.array(z.string()).optional(),
});
export type CreateVirtualCardDto = z.infer<typeof CreateVirtualCardSchema>;

/* Update Virtual Card DTO */
export const UpdateVirtualCardSchema = CreateVirtualCardSchema.partial();
export type UpdateVirtualCardDto = z.infer<typeof UpdateVirtualCardSchema>;

/* Virtual Card Response DTO */
export class VirtualCardResponseDto {
  @ApiProperty({ example: '07c03b10-cde1-41d5-a2be-8ab8978b51eb' })
  id!: string;

  @ApiProperty({ example: '**** **** **** 4242' })
  maskedNumber!: string;

  @ApiProperty({ example: '12/25' })
  expiry!: string;

  @ApiProperty({ example: 'MULTI_USE' })
  type!: VirtualCardType;

  @ApiProperty({ example: 'ACTIVE' })
  status!: VirtualCardStatus;

  @ApiPropertyOptional({ example: '10000' })
  spendingLimit?: string;

  @ApiPropertyOptional({ example: '5000' })
  dailyLimit?: string;

  @ApiProperty({ example: 'RWF' })
  currency!: Currency;

  @ApiProperty({ example: true })
  allowOnline!: boolean;

  @ApiProperty({ example: false })
  allowInternational!: boolean;

  @ApiPropertyOptional({ example: ['5812', '5814'] })
  blockedMccs?: string[];

  @ApiPropertyOptional({ example: ['merchant_123'] })
  allowedMerchants?: string[];

  @ApiProperty({ example: '2026-05-28T09:49:53+02:00' })
  createdAt!: Date;

  @ApiProperty({ example: '2026-05-28T09:49:53+02:00' })
  updatedAt!: Date;
}

/* Swagger DTOs for API documentation */

/**
 * DTO for creating a virtual card (Swagger)
 */
export class CreateVirtualCardDtoSwagger {
  @ApiProperty({ example: '07c03b10-cde1-41d5-a2be-8ab8978b51eb' })
  walletId!: string;

  @ApiPropertyOptional({ example: 'MULTI_USE', enum: ['SINGLE_USE', 'MULTI_USE', 'SUBSCRIPTION'] })
  type?: VirtualCardType;

  @ApiProperty({ example: 'RWF', enum: ['RWF', 'USD', 'KES', 'UGX', 'TZS', 'EUR'] })
  currency!: Currency;

  @ApiPropertyOptional({ example: '10000' })
  spendingLimit?: string;

  @ApiPropertyOptional({ example: '5000' })
  dailyLimit?: string;

  @ApiPropertyOptional({ example: true })
  allowOnline?: boolean;

  @ApiPropertyOptional({ example: false })
  allowInternational?: boolean;

  @ApiPropertyOptional({ example: ['5812', '5814'] })
  blockedMccs?: string[];

  @ApiPropertyOptional({ example: ['merchant_123'] })
  allowedMerchants?: string[];
}

/**
 * DTO for authorizing a transaction (Swagger)
 */
export class AuthorizeTransactionDtoSwagger {
  @ApiProperty({ example: '07c03b10-cde1-41d5-a2be-8ab8978b51eb' })
  virtualCardId!: string;

  @ApiProperty({ example: '1500' })
  amount!: string;

  @ApiProperty({ example: 'RWF', enum: ['RWF', 'USD', 'KES', 'UGX', 'TZS', 'EUR'] })
  currency!: Currency;

  @ApiProperty({ example: 'Online Store' })
  merchantName!: string;

  @ApiPropertyOptional({ example: 'Kigali' })
  merchantCity?: string;

  @ApiPropertyOptional({ example: 'Rwanda' })
  merchantCountry?: string;

  @ApiPropertyOptional({ example: '5411' })
  mcc?: string;
}

/**
 * DTO for capturing a transaction (Swagger)
 */
export class CaptureTransactionDtoSwagger {
  @ApiProperty({ example: '07c03b10-cde1-41d5-a2be-8ab8978b51eb' })
  authorizationId!: string;

  @ApiPropertyOptional({ example: '1500' })
  amount?: string;
}

/**
 * DTO for reversing a transaction (Swagger)
 */
export class ReverseTransactionDtoSwagger {
  @ApiProperty({ example: '07c03b10-cde1-41d5-a2be-8ab8978b51eb' })
  transactionId!: string;

  @ApiPropertyOptional({ example: '1500' })
  amount?: string;
}

/* Zod Schemas for transaction operations */
export const AuthorizeTransactionSchema = z.object({
  virtualCardId: z.string().uuid(),
  amount: z.string().regex(/^\d+(\.\d{1,4})?$/),
  currency: z.nativeEnum(Currency),
  merchantName: z.string(),
  merchantCity: z.string().optional(),
  merchantCountry: z.string().optional(),
  mcc: z.string().optional(),
});

export type AuthorizeTransactionDto = z.infer<typeof AuthorizeTransactionSchema>;

export const CaptureTransactionSchema = z.object({
  authorizationId: z.string().uuid(),
  amount: z.string().regex(/^\d+(\.\d{1,4})?$/).optional(),
});

export type CaptureTransactionDto = z.infer<typeof CaptureTransactionSchema>;

export const ReverseTransactionSchema = z.object({
  transactionId: z.string().uuid(),
  amount: z.string().regex(/^\d+(\.\d{1,4})?$/).optional(),
});

export type ReverseTransactionDto = z.infer<typeof ReverseTransactionSchema>;