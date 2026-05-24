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
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '@common/decorators/public.decorator';
import { ZodValidationPipe } from '@common/pipes/zod-validation.pipe';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { AuthUser } from '@modules/auth/strategies/jwt.strategy';
import { RegisterDeviceDto, RegisterDeviceSchema } from './dto/register-device.dto';
import { UpdateProfileDto, UpdateProfileSchema } from './dto/update-profile.dto';
import { UploadKycDto, UploadKycSchema } from './dto/upload-kyc.dto';
import { IdentityService } from './identity.service';

@ApiTags('identity')
@Controller('identity')
@UseGuards(JwtAuthGuard)
export class IdentityController {
  constructor(private readonly identityService: IdentityService) {}

  @Get('profile')
  getProfile(@CurrentUser() user: AuthUser) {
    return this.identityService.getProfile(user.userId);
  }

  @Patch('profile')
  updateProfile(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(UpdateProfileSchema)) dto: UpdateProfileDto,
  ) {
    return this.identityService.updateProfile(user.userId, dto);
  }

  @Get('devices')
  listDevices(@CurrentUser() user: AuthUser) {
    return this.identityService.listDevices(user.userId);
  }

  @Post('devices')
  registerDevice(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(RegisterDeviceSchema)) dto: RegisterDeviceDto,
  ) {
    return this.identityService.registerDevice(user.userId, dto);
  }

  @Patch('devices/:deviceId/trust')
  @HttpCode(HttpStatus.OK)
  trustDevice(@CurrentUser() user: AuthUser, @Param('deviceId') deviceId: string) {
    return this.identityService.trustDevice(user.userId, deviceId);
  }

  @Delete('devices/:deviceId')
  @HttpCode(HttpStatus.OK)
  removeDevice(@CurrentUser() user: AuthUser, @Param('deviceId') deviceId: string) {
    return this.identityService.removeDevice(user.userId, deviceId);
  }

  @Post('kyc')
  submitKyc(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(UploadKycSchema)) dto: UploadKycDto,
  ) {
    return this.identityService.submitKyc(user.userId, dto);
  }
}
