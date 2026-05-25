import { ApiProperty } from '@nestjs/swagger';
import { z } from 'zod';

export const ForgotPasswordSchema = z.object({
  email: z.string().email(),
});

export type ForgotPasswordDto = z.infer<typeof ForgotPasswordSchema>;

/**
 * DTO class for Swagger documentation (not used for validation)
 */
export class ForgotPasswordDtoSwagger {
  @ApiProperty({
    example: 'john@example.com',
    description: 'Registered email address',
  })
  email: string;
}
