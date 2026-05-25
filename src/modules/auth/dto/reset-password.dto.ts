import { ApiProperty } from '@nestjs/swagger';
import { z } from 'zod';

export const ResetPasswordSchema = z.object({
  email: z.string().email(),
  otp: z.string().length(6).regex(/^\d+$/, 'OTP must be numeric'),
  newPassword: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128)
    .regex(/[A-Z]/, 'Must contain an uppercase letter')
    .regex(/[a-z]/, 'Must contain a lowercase letter')
    .regex(/\d/, 'Must contain a digit'),
});

export type ResetPasswordDto = z.infer<typeof ResetPasswordSchema>;

/**
 * DTO class for Swagger documentation (not used for validation)
 */
export class ResetPasswordDtoSwagger {
  @ApiProperty({
    example: 'john@example.com',
    description: 'Registered email address',
  })
  email: string;

  @ApiProperty({
    example: '123456',
    description: 'One-time password (6 digits) sent to email',
  })
  otp: string;

  @ApiProperty({
    example: 'NewSecurePass@456',
    description: 'New password: min 8 chars, at least 1 uppercase, 1 lowercase, 1 digit',
  })
  newPassword: string;
}
