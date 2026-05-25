import { ApiProperty } from '@nestjs/swagger';
import { z } from 'zod';

export const VerifyEmailSchema = z.object({
  email: z.string().email(),
  otp: z.string().length(6, 'OTP must be 6 digits').regex(/^\d+$/, 'OTP must be numeric'),
});

export type VerifyEmailDto = z.infer<typeof VerifyEmailSchema>;

/**
 * DTO class for Swagger documentation (not used for validation)
 */
export class VerifyEmailDtoSwagger {
  @ApiProperty({
    example: 'john@example.com',
    description: 'Email address used during registration',
  })
  email: string;

  @ApiProperty({
    example: '123456',
    description: 'One-time password (6 digits) sent to email',
  })
  otp: string;
}
