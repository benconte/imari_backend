import { z } from 'zod';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export const CreateBeneficiarySchema = z.object({
  displayName: z.string().min(1).max(100),
  imariWalletNumber: z.string().regex(/^IMR-\d{10}$/),
  imariUserId: z.string().uuid().optional(),
  phone: z.string().optional(),
});

export type CreateBeneficiaryDto = z.infer<typeof CreateBeneficiarySchema>;

export class CreateBeneficiaryDtoSwagger {
  @ApiProperty({ example: 'John Doe' })
  displayName: string;

  @ApiProperty({ example: 'IMR-7465291357' })
  imariWalletNumber: string;

  @ApiPropertyOptional({ example: '07c03b10-cde1-41d5-a2be-8ab8978b51eb' })
  imariUserId?: string;

  @ApiPropertyOptional({ example: '+250788000000' })
  phone?: string;
}
