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
  ApiBody,
  ApiOkResponse,
  ApiCreatedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '@common/decorators/public.decorator';
import { ZodValidationPipe } from '@common/pipes/zod-validation.pipe';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { AuthUser } from '@modules/auth/strategies/jwt.strategy';
import { ConfirmMfaDto, ConfirmMfaSchema } from './dto/enable-mfa.dto';
import { DisableMfaDto, DisableMfaSchema } from './dto/verify-totp.dto';
import { MfaService } from './mfa.service';

/**
 * MFA Testing Flow (in Swagger):
 *  1. Authenticate via POST /auth/login  →  copy accessToken
 *  2. Click "Authorize" (🔒) and paste:  Bearer <accessToken>
 *  3. POST /mfa/enable                   →  copy the `secret` value
 *  4. Open Google Authenticator / Authy, add account manually with the secret
 *     OR use: https://totp.danhersam.com/?secret=<secret>  to generate a code
 *  5. POST /mfa/confirm with the 6-digit code  →  save the backup codes
 *  6. All future logins via POST /auth/login must include  totpCode
 */
@ApiTags('MFA')
@Controller('mfa')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class MfaController {
  constructor(private readonly mfaService: MfaService) {}

  /**
   * STEP 1 — Initialize MFA setup.
   * Returns a TOTP secret + QR code. Scan the QR with Google Authenticator or
   * Authy, or add the secret manually. MFA is NOT active until /mfa/confirm.
   */
  @Post('enable')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Initialize MFA setup (Step 1 of 2)',
    description: `
Start TOTP-based MFA enrollment. Returns **three setup methods** — pick any one:

| Method | Field | How to use |
|--------|-------|------------|
| **QR code** | \`qrDataUrl\` | Display as \`<img src="{qrDataUrl}">\`, user scans with authenticator camera |
| **Setup key** | \`formattedKey\` | User types the key manually in the authenticator app (e.g. Google Authenticator → + → Enter setup key) |
| **Setup URL** | \`setupUrl\` | Tap the \`otpauth://\` link on mobile to open the authenticator app directly |

All three methods encode the same secret, so they all produce the same TOTP codes.

**Quick browser test (no phone needed):**
Visit \`https://totp.danhersam.com?secret=<secret>\` to generate live codes.

After setup, call **POST /mfa/confirm** with the 6-digit code. MFA is not active until confirmation.
    `.trim(),
  })
  @ApiCreatedResponse({
    description: 'MFA setup initialized. Response includes three setup methods — use whichever fits your authenticator app.',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 201 },
        data: {
          type: 'object',
          properties: {
            qrDataUrl: {
              type: 'string',
              description: '**Method 1 — QR code:** PNG image as a data URL. Render in an `<img>` tag; user scans it with their authenticator camera.',
              example: 'data:image/png;base64,iVBORw0KGgoAAAANS...',
            },
            formattedKey: {
              type: 'string',
              description: '**Method 2 — Setup key:** The secret formatted in 4-character groups for readable display. User types this into the "Enter setup key" field of their authenticator app.',
              example: 'JBSW Y3DP EBLW 64TM MQQQ ====',
            },
            setupUrl: {
              type: 'string',
              description: '**Method 3 — Setup URL:** The `otpauth://` deep link URI. On mobile, tapping this link opens the authenticator app directly. Also the URI that is encoded inside the QR code.',
              example: 'otpauth://totp/Imari:user%40example.com?secret=JBSWY3DPEBLW64TMMQQQ%3D%3D&issuer=Imari',
            },
            secret: {
              type: 'string',
              description: 'Raw Base32 secret (unformatted). Use `formattedKey` for display; this field is kept for programmatic use.',
              example: 'JBSWY3DPEBLW64TMMQQQ====',
            },
          },
        },
      },
    },
  })
  @ApiBadRequestResponse({ description: 'MFA is already enabled on this account.' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid Bearer token.' })
  initEnable(@CurrentUser() user: AuthUser) {
    return this.mfaService.initEnable(user.userId);
  }

  /**
   * STEP 2 — Confirm MFA setup.
   * Verifies the TOTP code and activates MFA. Returns one-time backup codes —
   * store them securely; they cannot be retrieved again.
   */
  @Post('confirm')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Confirm MFA setup (Step 2 of 2)',
    description: `
Activate MFA by verifying the first TOTP code from your authenticator app.

**What to provide:**
- \`totpCode\` — the 6-digit code currently shown in your authenticator app (no spaces).

**On success:**
- MFA is now active; future logins require a TOTP code.
- You receive **10 backup codes** — save them offline. Each code is single-use.
    `.trim(),
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['totpCode'],
      properties: {
        totpCode: {
          type: 'string',
          description: '6-digit TOTP code from your authenticator app.',
          example: '123456',
          pattern: '^\\d{6}$',
          minLength: 6,
          maxLength: 6,
        },
      },
    },
  })
  @ApiOkResponse({
    description: 'MFA activated. Store the backup codes securely.',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 200 },
        data: {
          type: 'object',
          properties: {
            backupCodes: {
              type: 'array',
              items: { type: 'string' },
              description: '10 single-use backup codes for account recovery. Cannot be retrieved again.',
              example: ['ABC12', 'DEF34', 'GHI56', 'JKL78', 'MNO90', 'PQR12', 'STU34', 'VWX56', 'YZ789', 'AB012'],
            },
          },
        },
      },
    },
  })
  @ApiBadRequestResponse({
    description: 'Invalid TOTP code, or MFA setup was not initialized first.',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 400 },
        message: { type: 'string', example: 'Invalid TOTP code. Ensure your authenticator app is synced and time is correct.' },
      },
    },
  })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid Bearer token.' })
  confirmEnable(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(ConfirmMfaSchema)) dto: ConfirmMfaDto,
  ) {
    return this.mfaService.confirmEnable(user.userId, dto.totpCode);
  }

  /**
   * Returns the count of remaining unused backup codes.
   */
  @Get('backup-codes')
  @ApiOperation({
    summary: 'Get backup codes status',
    description: 'Returns how many of the 10 backup codes have not yet been used. Backup codes can be entered in place of a TOTP code when your authenticator is unavailable.',
  })
  @ApiOkResponse({
    description: 'Backup code counts returned.',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 200 },
        data: {
          type: 'object',
          properties: {
            remaining: { type: 'number', description: 'Unused backup codes.', example: 8 },
            total: { type: 'number', description: 'Total backup codes generated.', example: 10 },
          },
        },
      },
    },
  })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid Bearer token.' })
  getBackupCodeStatus(@CurrentUser() user: AuthUser) {
    return this.mfaService.getBackupCodeStatus(user.userId);
  }

  /**
   * Disables TOTP-based MFA.
   * Requires the current TOTP code or a backup code as confirmation.
   */
  @Delete('disable')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Disable MFA',
    description: `
Disable TOTP-based MFA on the account.

**What to provide:**
- \`code\` — the current 6-digit TOTP code from your authenticator app, **or** one of your backup codes.

After disabling, future logins will no longer require a TOTP code.
    `.trim(),
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['code'],
      properties: {
        code: {
          type: 'string',
          description: 'Current TOTP code (6 digits) OR a backup code.',
          example: '123456',
          minLength: 6,
          maxLength: 10,
        },
      },
    },
  })
  @ApiOkResponse({
    description: 'MFA disabled successfully.',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 200 },
        data: {
          type: 'object',
          properties: {
            message: { type: 'string', example: 'MFA disabled successfully' },
          },
        },
      },
    },
  })
  @ApiBadRequestResponse({
    description: 'MFA is not enabled, or the provided code is invalid.',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 400 },
        message: { type: 'string', example: 'MFA is not enabled' },
      },
    },
  })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid Bearer token, or wrong code.' })
  disable(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(DisableMfaSchema)) dto: DisableMfaDto,
  ) {
    return this.mfaService.disable(user.userId, dto.code);
  }
}
