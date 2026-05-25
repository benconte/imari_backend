import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { z } from 'zod';

export const RegisterSchema = z.object({
  email: z.string().email('Invalid email address'),
  phone: z
    .string()
    .regex(/^\+[1-9]\d{7,14}$/, 'Phone must be in E.164 format (e.g. +250788000000)'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128)
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/\d/, 'Password must contain at least one digit'),
  firstName: z.string().min(1).max(50).trim(),
  lastName: z.string().min(1).max(50).trim(),
  referralCode: z.string().optional(),
});

export type RegisterDto = z.infer<typeof RegisterSchema>;

/**
 * DTO class for Swagger documentation (not used for validation)
 */
export class RegisterDtoSwagger {
  @ApiProperty({
    example: 'john@example.com',
    description: 'Email address (must be unique)',
  })
  email: string;

  @ApiProperty({
    example: '+250788000000',
    description: 'Phone number in E.164 format (e.g., +250788000000 for Rwanda)',
  })
  phone: string;

  @ApiProperty({
    example: 'SecurePass@123',
    description: 'Password: min 8 chars, at least 1 uppercase, 1 lowercase, 1 digit',
  })
  password: string;

  @ApiProperty({
    example: 'John',
    description: 'First name (1-50 characters)',
  })
  firstName: string;

  @ApiProperty({
    example: 'Doe',
    description: 'Last name (1-50 characters)',
  })
  lastName: string;

  @ApiPropertyOptional({
    example: 'IMR-XXXXX',
    description: 'Optional referral code from another user',
  })
  referralCode?: string;
}
