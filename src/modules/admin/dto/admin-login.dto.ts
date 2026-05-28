import { IsEmail, IsNotEmpty, IsString, MinLength } from 'class-validator';

/**
 * Admin Login DTO
 * Credentials for admin authentication
 */
export class AdminLoginDto {
  @IsEmail()
  email: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(8, {
    message: 'Password must be at least 8 characters long',
  })
  password: string;
}
