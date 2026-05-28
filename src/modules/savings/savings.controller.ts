import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, HttpCode, HttpStatus, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags, ApiBody } from '@nestjs/swagger';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { CurrentUser } from '@common/decorators/public.decorator';
import { AuthUser } from '@modules/auth/strategies/jwt.strategy';
import { SavingsService } from './savings.service';
import {
  CreateVaultDtoSwagger,
  CreateVaultSchema,
  CreateVaultDto,
  UpdateVaultSchema,
  UpdateVaultDto,
  VaultDepositDtoSwagger,
  VaultDepositSchema,
  VaultWithdrawDtoSwagger,
  VaultWithdrawSchema,
  CreateRuleSchema,
  CreateRuleDtoSwagger,
  CreateRuleDto,
  UpdateRuleSchema,
} from './dto/savings.dto';
import { ZodValidationPipe } from '@common/pipes/zod-validation.pipe';

@ApiTags('savings')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('savings')
export class SavingsController {
  constructor(private readonly svc: SavingsService) {}

  @Post('vaults')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create savings vault' })
  @ApiBody({ type: CreateVaultDtoSwagger })
  async createVault(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(CreateVaultSchema)) dto: CreateVaultDto) {
    return this.svc.createVault(user.userId, dto);
  }

  @Get('vaults')
  async getVaults(@CurrentUser() user: AuthUser) {
    return this.svc.getUserVaults(user.userId);
  }

  @Get('vaults/:id')
  async getVault(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.svc.getVault(user.userId, id);
  }

  @Patch('vaults/:id')
  async updateVault(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body(new ZodValidationPipe(UpdateVaultSchema)) dto: UpdateVaultDto) {
    return this.svc.updateVault(user.userId, id, dto);
  }

  @Delete('vaults/:id')
  async deleteVault(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.svc.deleteVault(user.userId, id);
  }

  @Patch('vaults/:id/lock')
  async lockVault(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.svc.lockVault(user.userId, id);
  }

  @Patch('vaults/:id/unlock')
  async unlockVault(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.svc.unlockVault(user.userId, id);
  }

  @Post('vaults/:id/deposit')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiBody({ type: VaultDepositDtoSwagger })
  async deposit(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body(new ZodValidationPipe(VaultDepositSchema)) dto: any) {
    return this.svc.depositToVault(user.userId, id, dto);
  }

  @Post('vaults/:id/withdraw')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiBody({ type: VaultWithdrawDtoSwagger })
  async withdraw(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body(new ZodValidationPipe(VaultWithdrawSchema)) dto: any) {
    return this.svc.withdrawFromVault(user.userId, id, dto);
  }

  
  @Post('rules')
  @ApiBody({ type: CreateRuleDtoSwagger })
  async createRule(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(CreateRuleSchema)) dto: CreateRuleDto) {
    return this.svc.createRule(user.userId, dto);
  }

  @Get('rules')
  async getRules(@CurrentUser() user: AuthUser, @Query('walletId') walletId?: string) {
    return this.svc.getRules(user.userId, walletId);
  }

  @Patch('rules/:id')
  async updateRule(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body(new ZodValidationPipe(UpdateRuleSchema)) dto: any) {
    return this.svc.updateRule(user.userId, id, dto);
  }

  @Delete('rules/:id')
  async deleteRule(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.svc.deleteRule(user.userId, id);
  }

  @Patch('rules/:id/toggle')
  async toggleRule(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.svc.toggleRule(user.userId, id);
  }
}
