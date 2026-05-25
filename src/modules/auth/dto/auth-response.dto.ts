import { ApiProperty } from '@nestjs/swagger';

/**
 * Base response for auth endpoints
 */
export class MessageResponseDto {
  @ApiProperty({
    example: 'Account created. Check your email for a verification code.',
    description: 'Success message',
  })
  message: string;
}

/**
 * User profile embedded in auth responses
 */
export class UserProfileDto {
  @ApiProperty({ example: 'uuid-1234-5678-90ab', description: 'User ID' })
  id: string;

  @ApiProperty({ example: 'john@example.com', description: 'User email' })
  email: string;

  @ApiProperty({ example: '+250788000000', description: 'User phone number' })
  phone: string;

  @ApiProperty({ example: 'John', description: 'First name' })
  firstName: string;

  @ApiProperty({ example: 'Doe', description: 'Last name' })
  lastName: string;

  @ApiProperty({
    example: 'TIER_1',
    description: 'KYC tier',
    enum: ['TIER_0', 'TIER_1', 'TIER_2', 'TIER_3'],
  })
  kycTier: string;

  @ApiProperty({
    example: 'USD',
    description: 'Preferred currency',
    enum: ['RWF', 'USD', 'EUR', 'KES', 'UGX', 'TZS'],
  })
  preferredCurrency: string;

  @ApiProperty({
    example: 'https://cdn.imari.com/avatar-1.jpg',
    nullable: true,
    description: 'Profile photo URL',
  })
  profilePhotoUrl?: string;

  @ApiProperty({
    example: false,
    description: 'Whether MFA is enabled',
  })
  isMfaEnabled: boolean;
}

/**
 * Login response with tokens
 */
export class LoginResponseDto {
  @ApiProperty({
    example:
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c',
    description: 'JWT access token (expires in 15 minutes)',
  })
  accessToken: string;

  @ApiProperty({
    example:
      'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8c9d0e1f',
    description: 'Refresh token (expires in 30 days, secure httpOnly cookie recommended)',
  })
  refreshToken: string;

  @ApiProperty({ type: UserProfileDto, description: 'User profile' })
  user: UserProfileDto;
}

/**
 * Refresh token response
 */
export class RefreshResponseDto {
  @ApiProperty({
    example:
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c',
    description: 'New JWT access token (old token is revoked)',
  })
  accessToken: string;

  @ApiProperty({
    example:
      'f0e1d2c3b4a5968778695a4b3c2d1e0f9a8b7c6d5e4f3a2b1c0d9e8f7a6b5',
    description: 'New refresh token (old token is revoked)',
  })
  refreshToken: string;
}

/**
 * Generic API wrapper for all responses
 */
export class ApiResponseDto<T> {
  @ApiProperty({ description: 'Response status code' })
  statusCode: number;

  @ApiProperty({ description: 'Response data (generic)' })
  data: T;

  @ApiProperty({ example: null, nullable: true, description: 'Error details if any' })
  error?: object | null;

  @ApiProperty({
    example: new Date().toISOString(),
    description: 'Response timestamp',
  })
  timestamp: string;
}
