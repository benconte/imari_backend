import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { z } from 'zod';

export const DeviceSchema = z
  .object({
    deviceId: z.string().uuid().optional(),
    deviceName: z.string().max(100).optional(),
    deviceType: z.enum(['IOS', 'ANDROID', 'WEB']).optional(),
    platform: z.string().max(50).optional(),
    osVersion: z.string().max(30).optional(),
    appVersion: z.string().max(20).optional(),
    fingerprint: z.string().max(255).optional(),
    pushToken: z.string().max(255).optional(),
  })
  .optional();

export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  totpCode: z.string().length(6).optional(),
  device: DeviceSchema,
});

export type LoginDto = z.infer<typeof LoginSchema>;
export type DeviceDto = z.infer<typeof DeviceSchema>;

/**
 * DTO classes for Swagger documentation (not used for validation)
 */
export class DeviceDtoSwagger {
  @ApiPropertyOptional({
    example: 'device-uuid-1234-5678',
    description: 'Unique device identifier (UUID)',
  })
  deviceId?: string;

  @ApiPropertyOptional({
    example: 'iPhone 14',
    description: 'Device name/model',
  })
  deviceName?: string;

  @ApiPropertyOptional({
    example: 'IOS',
    enum: ['IOS', 'ANDROID', 'WEB'],
    description: 'Operating system',
  })
  deviceType?: string;

  @ApiPropertyOptional({
    example: 'iPhone OS',
    description: 'Platform name',
  })
  platform?: string;

  @ApiPropertyOptional({
    example: '17.1.2',
    description: 'OS version',
  })
  osVersion?: string;

  @ApiPropertyOptional({
    example: '1.2.5',
    description: 'App version',
  })
  appVersion?: string;

  @ApiPropertyOptional({
    example: 'abc123def456xyz789',
    description: 'Device fingerprint for security',
  })
  fingerprint?: string;

  @ApiPropertyOptional({
    example: 'fcm_token_xxxxx',
    description: 'FCM push notification token',
  })
  pushToken?: string;
}

export class LoginDtoSwagger {
  @ApiProperty({
    example: 'john@example.com',
    description: 'Email address',
  })
  email: string;

  @ApiProperty({
    example: 'SecurePass@123',
    description: 'Password',
  })
  password: string;

  @ApiPropertyOptional({
    example: '123456',
    description: 'TOTP code (6 digits) - required if MFA is enabled on account',
  })
  totpCode?: string;

  @ApiPropertyOptional({
    type: DeviceDtoSwagger,
    description: 'Device information (recommended for mobile apps)',
  })
  device?: DeviceDtoSwagger;
}
