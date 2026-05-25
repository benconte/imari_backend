import { ApiProperty } from '@nestjs/swagger';
import { z } from 'zod';

export const RefreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

export type RefreshTokenDto = z.infer<typeof RefreshTokenSchema>;

/**
 * DTO class for Swagger documentation (not used for validation)
 */
export class RefreshTokenDtoSwagger {
  @ApiProperty({
    example: 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6',
    description: 'Refresh token from previous login/refresh response',
  })
  refreshToken: string;
}
