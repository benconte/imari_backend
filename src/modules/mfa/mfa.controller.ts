import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '@common/decorators/public.decorator';
import { ZodValidationPipe } from '@common/pipes/zod-validation.pipe';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { AuthUser } from '@modules/auth/strategies/jwt.strategy';
import { ConfirmMfaDto, ConfirmMfaSchema } from './dto/enable-mfa.dto';
import { DisableMfaDto, DisableMfaSchema } from './dto/verify-totp.dto';
import { MfaService } from './mfa.service';

@ApiTags('mfa')
@Controller('mfa')
@UseGuards(JwtAuthGuard)
export class MfaController {
  constructor(private readonly mfaService: MfaService) {}

  @Post('enable')
  initEnable(@CurrentUser() user: AuthUser) {
    return this.mfaService.initEnable(user.userId);
  }

  @Post('confirm')
  @HttpCode(HttpStatus.OK)
  confirmEnable(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(ConfirmMfaSchema)) dto: ConfirmMfaDto,
  ) {
    return this.mfaService.confirmEnable(user.userId, dto.totpCode);
  }

  @Get('backup-codes')
  getBackupCodeStatus(@CurrentUser() user: AuthUser) {
    return this.mfaService.getBackupCodeStatus(user.userId);
  }

  @Delete('disable')
  @HttpCode(HttpStatus.OK)
  disable(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(DisableMfaSchema)) dto: DisableMfaDto,
  ) {
    return this.mfaService.disable(user.userId, dto.code);
  }
}
