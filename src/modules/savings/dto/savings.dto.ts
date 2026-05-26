import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { z } from 'zod';
import { Currency } from '@prisma/client';

/* Vault DTOs */
export const CreateVaultSchema = z.object({
  walletId: z.string().uuid(),
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  targetAmount: z.string().regex(/^\d+(\.\d{1,4})?$/),
  currency: z.nativeEnum(Currency),
  targetDate: z.string().datetime().optional(),
  iconEmoji: z.string().max(8).optional(),
});
export type CreateVaultDto = z.infer<typeof CreateVaultSchema>;

export const UpdateVaultSchema = CreateVaultSchema.partial();
export type UpdateVaultDto = z.infer<typeof UpdateVaultSchema>;

export class CreateVaultDtoSwagger {
  @ApiProperty({ example: '07c03b10-cde1-41d5-a2be-8ab8978b51eb' })
  walletId: string;

  @ApiProperty({ example: 'Holiday Fund' })
  name: string;

  @ApiPropertyOptional({ example: 'Save for December holiday' })
  description?: string;

  @ApiProperty({ example: '100000', description: 'Target amount as string' })
  targetAmount: string;

  @ApiProperty({ example: 'RWF', enum: ['RWF', 'USD', 'KES', 'UGX', 'TZS', 'EUR'] })
  currency: Currency;

  @ApiPropertyOptional({ example: '2026-12-01T00:00:00Z' })
  targetDate?: string;

  @ApiPropertyOptional({ example: '🎯' })
  iconEmoji?: string;
}

/* Deposit/Withdraw DTOs */
export const VaultDepositSchema = z.object({
  amount: z.string().regex(/^\d+(\.\d{1,4})?$/),
  idempotencyKey: z.string().uuid().optional(),
});
export type VaultDepositDto = z.infer<typeof VaultDepositSchema>;

export const VaultWithdrawSchema = z.object({
  amount: z.string().regex(/^\d+(\.\d{1,4})?$/),
  idempotencyKey: z.string().uuid().optional(),
});
export type VaultWithdrawDto = z.infer<typeof VaultWithdrawSchema>;

export class VaultDepositDtoSwagger {
  @ApiProperty({ example: '1000' })
  amount: string;

  @ApiPropertyOptional({ example: '550e8400-e29b-41d4-a716-446655440000' })
  idempotencyKey?: string;
}

export class VaultWithdrawDtoSwagger {
  @ApiProperty({ example: '1000' })
  amount: string;

  @ApiPropertyOptional({ example: '550e8400-e29b-41d4-a716-446655440000' })
  idempotencyKey?: string;
}

/* Savings Rule DTOs */
export const CreateRuleSchema = z.object({
  walletId: z.string().uuid(),
  vaultId: z.string().uuid(),
  type: z.enum(['ROUND_UP', 'FIXED_AMOUNT', 'PERCENTAGE', 'SCHEDULED']),
  amount: z.string().optional(),
  percentage: z.number().optional(),
  cronExpression: z.string().optional(),
});
export type CreateRuleDto = z.infer<typeof CreateRuleSchema>;

export const UpdateRuleSchema = CreateRuleSchema.partial();
export type UpdateRuleDto = z.infer<typeof UpdateRuleSchema>;

export class CreateRuleDtoSwagger {
  @ApiProperty({ example: '07c03b10-cde1-41d5-a2be-8ab8978b51eb' })
  walletId: string;

  @ApiProperty({ example: '07c03b10-cde1-41d5-a2be-8ab8978b51ec' })
  vaultId: string;

  @ApiProperty({ example: 'ROUND_UP', enum: ['ROUND_UP', 'FIXED_AMOUNT', 'PERCENTAGE', 'SCHEDULED'] })
  type: string;

  @ApiPropertyOptional({ example: '100' })
  amount?: string;

  @ApiPropertyOptional({ example: 5 })
  percentage?: number;

  @ApiPropertyOptional({ example: '0 0 * * *' })
  cronExpression?: string;
}
