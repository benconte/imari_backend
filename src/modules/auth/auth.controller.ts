import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiBody,
  ApiInternalServerErrorResponse,
  ApiBadRequestResponse,
  ApiUnauthorizedResponse,
  ApiConflictResponse,
} from '@nestjs/swagger';
import { Request } from 'express';
import { CurrentUser, Public } from '@common/decorators/public.decorator';
import { ZodValidationPipe } from '@common/pipes/zod-validation.pipe';
import { AuthService } from './auth.service';
import { ForgotPasswordDto, ForgotPasswordDtoSwagger, ForgotPasswordSchema } from './dto/forgot-password.dto';
import { LoginDto, LoginDtoSwagger, LoginSchema } from './dto/login.dto';
import { RefreshTokenDto, RefreshTokenDtoSwagger, RefreshTokenSchema } from './dto/refresh-token.dto';
import { RegisterDto, RegisterDtoSwagger, RegisterSchema } from './dto/register.dto';
import { ResetPasswordDto, ResetPasswordDtoSwagger, ResetPasswordSchema } from './dto/reset-password.dto';
import { VerifyEmailDto, VerifyEmailDtoSwagger, VerifyEmailSchema } from './dto/verify-email.dto';
import {
  ApiResponseDto,
  MessageResponseDto,
  LoginResponseDto,
  RefreshResponseDto,
} from './dto/auth-response.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { AuthUser } from './strategies/jwt.strategy';

@ApiTags('Auth')
@Controller('auth')
@UseGuards(JwtAuthGuard)
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * Register a new user account
   *
   * Creates a new user account with email, phone, and password.
   * Sends verification OTP to email.
   * User status starts as PENDING until email is verified.
   *
   * @param dto Registration details (email, phone, password, firstName, lastName)
   * @returns Message confirming registration and OTP dispatch
   */
  @Public()
  @Post('register')
  @ApiOperation({
    summary: 'Register a new user',
    description:
      'Create a new user account. An email OTP will be sent for verification. Account status is PENDING until verified.',
  })
  @ApiBody({
    type: RegisterDtoSwagger,
    examples: {
      valid: {
        summary: 'Valid registration',
        value: {
          email: 'john@example.com',
          phone: '+250788000000',
          password: 'SecurePass@123',
          firstName: 'John',
          lastName: 'Doe',
        },
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: 'User created successfully, OTP sent to email',
    type: ApiResponseDto<MessageResponseDto>,
    example: {
      statusCode: 201,
      data: {
        message: 'Account created. Check your email for a verification code.',
      },
      timestamp: new Date().toISOString(),
    },
  })
  @ApiConflictResponse({
    description: 'Email or phone already registered',
    example: {
      statusCode: 409,
      error: {
        message: 'Email already registered',
      },
    },
  })
  @ApiBadRequestResponse({
    description: 'Invalid input (email format, password strength, phone format)',
    example: {
      statusCode: 400,
      error: {
        message: 'Password must contain at least one uppercase letter',
      },
    },
  })
  @ApiInternalServerErrorResponse({ description: 'Email service or database error' })
  register(@Body(new ZodValidationPipe(RegisterSchema)) dto: RegisterDto) {
    return this.authService.register(dto);
  }

  /**
   * Verify email with OTP
   *
   * Consumes the OTP sent during registration.
   * Activates user account and sets KYC tier to TIER_1.
   *
   * @param dto Email and 6-digit OTP
   * @returns Confirmation message
   */
  @Public()
  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Verify email address',
    description: 'Verify email with the OTP sent during registration. Activates the account.',
  })
  @ApiBody({
    type: VerifyEmailDtoSwagger,
    examples: {
      valid: {
        summary: 'Valid OTP',
        value: {
          email: 'john@example.com',
          otp: '123456',
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Email verified, account activated',
    type: ApiResponseDto<MessageResponseDto>,
    example: {
      statusCode: 200,
      data: {
        message: 'Email verified. You can now log in.',
      },
      timestamp: new Date().toISOString(),
    },
  })
  @ApiBadRequestResponse({
    description: 'OTP invalid or expired, or email already verified',
  })
  @ApiInternalServerErrorResponse({ description: 'Database error' })
  verifyEmail(@Body(new ZodValidationPipe(VerifyEmailSchema)) dto: VerifyEmailDto) {
    return this.authService.verifyEmail(dto);
  }

  /**
   * Login with email and password
   *
   * Authenticates user and returns JWT tokens.
   * Validates password, checks email verification, and account status.
   * Supports MFA if enabled (must provide totpCode).
   * Tracks login attempts and enforces lockout after failures.
   *
   * @param dto Email, password, optional TOTP code, and optional device info
   * @param req Express request for IP and user agent tracking
   * @returns Access token, refresh token, and user profile
   */
  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Login user',
    description:
      'Authenticate with email and password. Returns access and refresh tokens. If MFA is enabled, provide totpCode.',
  })
  @ApiBody({
    type: LoginDtoSwagger,
    examples: {
      basic: {
        summary: 'Basic login',
        value: {
          email: 'john@example.com',
          password: 'SecurePass@123',
        },
      },
      withMfa: {
        summary: 'Login with MFA',
        value: {
          email: 'john@example.com',
          password: 'SecurePass@123',
          totpCode: '123456',
        },
      },
      withDevice: {
        summary: 'Login with device info (recommended for mobile)',
        value: {
          email: 'john@example.com',
          password: 'SecurePass@123',
          device: {
            deviceId: 'device-uuid-1234',
            deviceName: 'iPhone 14',
            deviceType: 'IOS',
            pushToken: 'fcm-token-xxx',
          },
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Login successful, tokens returned',
    type: ApiResponseDto<LoginResponseDto>,
    example: {
      statusCode: 200,
      data: {
        accessToken:
          'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1dWlkLWhlcmUiLCJqdGkiOiJ1dWlkLWp0aSIsImlhdCI6MTcxNjY2MTY0MCwiZXhwIjoxNzE2NjYyNTQwfQ.xxx',
        refreshToken: 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6',
        user: {
          id: 'uuid-1234',
          email: 'john@example.com',
          phone: '+250788000000',
          firstName: 'John',
          lastName: 'Doe',
          kycTier: 'TIER_1',
          preferredCurrency: 'USD',
          isMfaEnabled: false,
        },
      },
      timestamp: new Date().toISOString(),
    },
  })
  @ApiUnauthorizedResponse({
    description: 'Invalid credentials or MFA code required',
  })
  @ApiBadRequestResponse({
    description: 'Account locked (too many failed attempts), unverified, or inactive',
  })
  @ApiInternalServerErrorResponse({ description: 'Database or MFA service error' })
  login(
    @Body(new ZodValidationPipe(LoginSchema)) dto: LoginDto,
    @Req() req: Request,
  ) {
    return this.authService.login(dto, {
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  /**
   * Refresh access token
   *
   * Rotates tokens: old refresh token is revoked, new tokens issued.
   * Access token expires in 15 minutes.
   * Refresh token expires in 30 days.
   *
   * @param dto Current refresh token
   * @returns New access and refresh tokens
   */
  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Refresh access token',
    description:
      'Rotate tokens using refresh token. Old refresh token is revoked. Returns new access token (15 min) and refresh token (30 days).',
  })
  @ApiBody({
    type: RefreshTokenDtoSwagger,
    examples: {
      valid: {
        summary: 'Valid refresh token',
        value: {
          refreshToken: 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6',
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Tokens refreshed (rotated)',
    type: ApiResponseDto<RefreshResponseDto>,
    example: {
      statusCode: 200,
      data: {
        accessToken:
          'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1dWlkLWhlcmUiLCJqdGkiOiJuZXctdXVpZC1qdGkiLCJpYXQiOjE3MTY2NjE3NTAsImV4cCI6MTcxNjY2MjY1MH0.xxx',
        refreshToken: 'z9y8x7w6v5u4t3s2r1q0p9o8n7m6l5k4',
      },
      timestamp: new Date().toISOString(),
    },
  })
  @ApiUnauthorizedResponse({
    description: 'Invalid, expired, or already revoked refresh token',
  })
  @ApiInternalServerErrorResponse({ description: 'Database error' })
  refresh(@Body(new ZodValidationPipe(RefreshTokenSchema)) dto: RefreshTokenDto) {
    return this.authService.refreshTokens(dto.refreshToken);
  }

  /**
   * Logout user
   *
   * Revokes current session (access token is invalidated).
   * User can log back in with credentials.
   * Requires valid JWT access token.
   *
   * @param user Current authenticated user (from JWT)
   * @returns Confirmation message
   */
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Logout user',
    description: 'Revoke current session. Requires valid access token. User must log in again.',
  })
  @ApiResponse({
    status: 200,
    description: 'Logged out successfully',
    type: ApiResponseDto<MessageResponseDto>,
    example: {
      statusCode: 200,
      data: {
        message: 'Logged out successfully',
      },
      timestamp: new Date().toISOString(),
    },
  })
  @ApiUnauthorizedResponse({
    description: 'Missing or invalid access token',
  })
  @ApiInternalServerErrorResponse({ description: 'Database error' })
  logout(@CurrentUser() user: AuthUser) {
    return this.authService.logout(user.jti, user.userId);
  }

  /**
   * Request password reset
   *
   * Sends password reset OTP to registered email.
   * Returns success message regardless of email existence (security).
   *
   * @param dto Email address
   * @returns Confirmation message
   */
  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Request password reset',
    description:
      'Send password reset OTP to email. Returns success regardless of email existence (security measure).',
  })
  @ApiBody({
    type: ForgotPasswordDtoSwagger,
    examples: {
      valid: {
        summary: 'Valid email',
        value: {
          email: 'john@example.com',
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Reset OTP sent to email (if email exists)',
    type: ApiResponseDto<MessageResponseDto>,
    example: {
      statusCode: 200,
      data: {
        message: 'If that email is registered, a reset code has been sent.',
      },
      timestamp: new Date().toISOString(),
    },
  })
  @ApiInternalServerErrorResponse({ description: 'Email service error' })
  forgotPassword(@Body(new ZodValidationPipe(ForgotPasswordSchema)) dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto.email);
  }

  /**
   * Reset password with OTP
   *
   * Consumes reset OTP and updates password.
   * Revokes all active sessions after reset.
   *
   * @param dto Email, reset OTP, and new password
   * @returns Confirmation message
   */
  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Reset password',
    description:
      'Reset password using OTP from forgot-password. Revokes all active sessions after reset.',
  })
  @ApiBody({
    type: ResetPasswordDtoSwagger,
    examples: {
      valid: {
        summary: 'Valid reset',
        value: {
          email: 'john@example.com',
          otp: '123456',
          newPassword: 'NewSecurePass@456',
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Password reset successfully',
    type: ApiResponseDto<MessageResponseDto>,
    example: {
      statusCode: 200,
      data: {
        message: 'Password reset successfully. Please log in with your new password.',
      },
      timestamp: new Date().toISOString(),
    },
  })
  @ApiBadRequestResponse({
    description: 'OTP invalid/expired or password invalid',
  })
  @ApiInternalServerErrorResponse({ description: 'Database error' })
  resetPassword(@Body(new ZodValidationPipe(ResetPasswordSchema)) dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }
}
