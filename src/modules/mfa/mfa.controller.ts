import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiResponse,
  ApiUnauthorizedResponse,
  ApiBadRequestResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '@common/decorators/public.decorator';
import { ZodValidationPipe } from '@common/pipes/zod-validation.pipe';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { AuthUser } from '@modules/auth/strategies/jwt.strategy';
import { ConfirmMfaDto, ConfirmMfaSchema } from './dto/enable-mfa.dto';
import { DisableMfaDto, DisableMfaSchema } from './dto/verify-totp.dto';
import { MfaService } from './mfa.service';

/**
 * Multi-Factor Authentication (MFA) Controller
 *
 * Manages TOTP-based MFA (Google Authenticator compatible)
 * All endpoints require authentication (Bearer JWT token)
 * Protected by JwtAuthGuard at controller level
 */
@ApiTags('MFA')
@Controller('mfa')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class MfaController {
  constructor(private readonly mfaService: MfaService) {}

  /**
   * Initialize MFA setup
   *
   * Starts the MFA setup process:
   * - Generates TOTP secret
   * - Returns QR code URL (for Google Authenticator, Authy, etc.)
   * - Returns backup codes for account recovery
   *
   * Note: MFA is not active until confirmed with /mfa/confirm
   *
   * Requires: Valid JWT access token
   */
  @Post('enable')
  @ApiOperation({
    summary: 'Initialize MFA setup',
    description:
      'Start TOTP-based MFA setup. Returns QR code and backup codes. MFA becomes active only after confirmation at /mfa/confirm endpoint.',
  })
  @ApiResponse({
    status: 201,
    description: 'MFA setup initialized',
    example: {
      statusCode: 201,
      data: {
        secret: 'JBSWY3DPEBLW64TMMQ======',
        qrCodeUrl: 'data:image/png;base64,...',
        backupCodes: ['code-1', 'code-2', '...'],
        message: 'Scan QR code with your authenticator app and confirm with code from app',
      },
    },
  })
  @ApiUnauthorizedResponse({
    description: 'Missing or invalid access token',
  })
  initEnable(@CurrentUser() user: AuthUser) {
    return this.mfaService.initEnable(user.userId);
  }

  /**
   * Confirm MFA setup
   *
   * Confirms MFA is working by verifying TOTP code
   * - User provides 6-digit code from authenticator app
   * - If correct, MFA is activated on account
   * - Future logins will require TOTP code
   *
   * Requires: Valid JWT access token
   * Requires: Valid TOTP code from authenticator app
   */
  @Post('confirm')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Confirm MFA setup',
    description:
      'Verify TOTP code to activate MFA. Provide 6-digit code from authenticator app. Once confirmed, MFA will be required on future logins.',
  })
  @ApiResponse({
    status: 200,
    description: 'MFA activated successfully',
    example: {
      statusCode: 200,
      data: {
        message: 'MFA activated successfully',
        backupCodes: ['code-1', 'code-2', '...'],
      },
    },
  })
  @ApiBadRequestResponse({
    description: 'Invalid TOTP code or MFA setup not initialized',
  })
  @ApiUnauthorizedResponse({
    description: 'Missing or invalid access token',
  })
  confirmEnable(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(ConfirmMfaSchema)) dto: ConfirmMfaDto,
  ) {
    return this.mfaService.confirmEnable(user.userId, dto.totpCode);
  }

  /**
   * Get backup codes status
   *
   * Returns the count of remaining unused backup codes
   * Backup codes can be used instead of TOTP if authenticator is unavailable
   *
   * Requires: Valid JWT access token
   */
  @Get('backup-codes')
  @ApiOperation({
    summary: 'Get backup codes status',
    description:
      'Check how many backup codes are available. Backup codes can be used to login if authenticator is unavailable.',
  })
  @ApiResponse({
    status: 200,
    description: 'Backup codes status retrieved',
    example: {
      statusCode: 200,
      data: {
        totalCodes: 10,
        remainingCodes: 8,
        usedCodes: 2,
        message: '8 backup codes remaining',
      },
    },
  })
  @ApiUnauthorizedResponse({
    description: 'Missing or invalid access token',
  })
  getBackupCodeStatus(@CurrentUser() user: AuthUser) {
    return this.mfaService.getBackupCodeStatus(user.userId);
  }

  /**
   * Disable MFA
   *
   * Disables TOTP-based MFA on the account
   * - MFA code (from authenticator) or backup code required to confirm
   * - Account will no longer require TOTP on login
   *
   * Requires: Valid JWT access token
   * Requires: Valid TOTP code or backup code
   */
  @Delete('disable')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Disable MFA',
    description:
      'Disable TOTP-based MFA. Requires TOTP code or backup code for confirmation. After disabling, MFA will no longer be required on login.',
  })
  @ApiResponse({
    status: 200,
    description: 'MFA disabled successfully',
    example: {
      statusCode: 200,
      data: {
        message: 'MFA has been disabled',
      },
    },
  })
  @ApiBadRequestResponse({
    description: 'Invalid code or MFA not enabled',
  })
  @ApiUnauthorizedResponse({
    description: 'Missing or invalid access token',
  })
  disable(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(DisableMfaSchema)) dto: DisableMfaDto,
  ) {
    return this.mfaService.disable(user.userId, dto.code);
  }
}
