import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiResponse,
  ApiUnauthorizedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiBadRequestResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '@common/decorators/public.decorator';
import { ZodValidationPipe } from '@common/pipes/zod-validation.pipe';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { AuthUser } from '@modules/auth/strategies/jwt.strategy';
import { RegisterDeviceDto, RegisterDeviceSchema } from './dto/register-device.dto';
import { UpdateProfileDto, UpdateProfileSchema } from './dto/update-profile.dto';
import { UploadKycDto, UploadKycSchema } from './dto/upload-kyc.dto';
import { IdentityService } from './identity.service';

/**
 * Identity Management Controller
 *
 * All endpoints require authentication (Bearer JWT token)
 * Protected by JwtAuthGuard at controller level
 */
@ApiTags('Identity')
@Controller('identity')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class IdentityController {
  constructor(private readonly identityService: IdentityService) {}

  /**
   * Get authenticated user's profile
   *
   * Returns user profile information including:
   * - Email, phone, names
   * - KYC tier and status
   * - Profile photo URL
   * - Account status
   *
   * Requires: Valid JWT access token
   */
  @Get('profile')
  @ApiOperation({
    summary: 'Get user profile',
    description: 'Retrieve authenticated user profile information. Requires valid access token.',
  })
  @ApiResponse({
    status: 200,
    description: 'User profile retrieved',
    example: {
      statusCode: 200,
      data: {
        id: 'uuid-1234',
        email: 'user@example.com',
        phone: '+250788000000',
        firstName: 'John',
        lastName: 'Doe',
        status: 'ACTIVE',
        kycTier: 'TIER_1',
        profilePhotoUrl: null,
        createdAt: '2024-05-25T08:57:00Z',
      },
    },
  })
  @ApiUnauthorizedResponse({
    description: 'Missing or invalid access token',
  })
  getProfile(@CurrentUser() user: AuthUser) {
    return this.identityService.getProfile(user.userId);
  }

  /**
   * Update user profile
   *
   * Allows updating:
   * - Profile photo URL
   * - Preferred currency
   * - Preferred language
   *
   * Requires: Valid JWT access token
   */
  @Patch('profile')
  @ApiOperation({
    summary: 'Update user profile',
    description: 'Update user profile information. Requires valid access token.',
  })
  @ApiResponse({
    status: 200,
    description: 'Profile updated successfully',
  })
  @ApiBadRequestResponse({
    description: 'Invalid input data',
  })
  @ApiUnauthorizedResponse({
    description: 'Missing or invalid access token',
  })
  updateProfile(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(UpdateProfileSchema)) dto: UpdateProfileDto,
  ) {
    return this.identityService.updateProfile(user.userId, dto);
  }

  /**
   * List user's registered devices
   *
   * Returns all devices registered by the user:
   * - Device ID, name, type (IOS/ANDROID/WEB)
   * - Trust status
   * - Last used timestamp
   *
   * Requires: Valid JWT access token
   */
  @Get('devices')
  @ApiOperation({
    summary: 'List user devices',
    description: 'Get list of all devices registered by the user. Requires valid access token.',
  })
  @ApiResponse({
    status: 200,
    description: 'Devices list retrieved',
    example: {
      statusCode: 200,
      data: {
        devices: [
          {
            id: 'device-uuid-1',
            name: 'iPhone 14',
            type: 'IOS',
            isTrusted: true,
            lastUsedAt: '2024-05-25T08:57:00Z',
          },
        ],
      },
    },
  })
  @ApiUnauthorizedResponse({
    description: 'Missing or invalid access token',
  })
  listDevices(@CurrentUser() user: AuthUser) {
    return this.identityService.listDevices(user.userId);
  }

  /**
   * Register new device
   *
   * Register a device for:
   * - Multi-device login tracking
   * - Push notification support
   * - Device-based security features
   *
   * Requires: Valid JWT access token
   */
  @Post('devices')
  @ApiOperation({
    summary: 'Register new device',
    description: 'Register a new device for the user. Requires valid access token.',
  })
  @ApiResponse({
    status: 201,
    description: 'Device registered successfully',
  })
  @ApiBadRequestResponse({
    description: 'Invalid device information',
  })
  @ApiUnauthorizedResponse({
    description: 'Missing or invalid access token',
  })
  registerDevice(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(RegisterDeviceSchema)) dto: RegisterDeviceDto,
  ) {
    return this.identityService.registerDevice(user.userId, dto);
  }

  /**
   * Mark device as trusted
   *
   * Trust a device to:
   * - Skip MFA on future logins from this device
   * - Improve user experience on known devices
   *
   * Requires: Valid JWT access token
   */
  @Patch('devices/:deviceId/trust')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Trust device',
    description:
      'Mark a device as trusted (skip MFA on future logins). Requires valid access token.',
  })
  @ApiResponse({
    status: 200,
    description: 'Device marked as trusted',
  })
  @ApiNotFoundResponse({
    description: 'Device not found',
  })
  @ApiUnauthorizedResponse({
    description: 'Missing or invalid access token',
  })
  trustDevice(@CurrentUser() user: AuthUser, @Param('deviceId') deviceId: string) {
    return this.identityService.trustDevice(user.userId, deviceId);
  }

  /**
   * Remove device
   *
   * Unregister a device to:
   * - Remove lost or stolen devices
   * - Revoke device access
   *
   * Requires: Valid JWT access token
   */
  @Delete('devices/:deviceId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Remove device',
    description: 'Unregister a device from the user account. Requires valid access token.',
  })
  @ApiResponse({
    status: 200,
    description: 'Device removed successfully',
  })
  @ApiNotFoundResponse({
    description: 'Device not found',
  })
  @ApiUnauthorizedResponse({
    description: 'Missing or invalid access token',
  })
  removeDevice(@CurrentUser() user: AuthUser, @Param('deviceId') deviceId: string) {
    return this.identityService.removeDevice(user.userId, deviceId);
  }

  /**
   * Submit KYC document
   *
   * Upload KYC documents for account verification:
   * - ID document (URL)
   * - Proof of address (URL)
   * - Selfie (URL)
   *
   * Note: Actual document verification is stubbed for now
   *
   * Requires: Valid JWT access token
   */
  @Post('kyc')
  @ApiOperation({
    summary: 'Submit KYC document',
    description:
      'Submit KYC documents for account verification. Requires valid access token. Document verification is currently stubbed.',
  })
  @ApiResponse({
    status: 201,
    description: 'KYC submitted successfully',
  })
  @ApiBadRequestResponse({
    description: 'Invalid KYC data or file URL',
  })
  @ApiUnauthorizedResponse({
    description: 'Missing or invalid access token',
  })
  submitKyc(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(UploadKycSchema)) dto: UploadKycDto,
  ) {
    return this.identityService.submitKyc(user.userId, dto);
  }
}
