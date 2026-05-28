import { Controller, Post, Get, Delete, Param, Body, UseGuards, HttpCode, HttpStatus, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiBody, ApiResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { CurrentUser } from '@common/decorators/public.decorator';
import { AuthUser } from '@modules/auth/strategies/jwt.strategy';
import { BeneficiaryService } from './beneficiary.service';
import { ZodValidationPipe } from '@common/pipes/zod-validation.pipe';
import { CreateBeneficiarySchema, CreateBeneficiaryDtoSwagger } from './dto/beneficiary.dto';

@ApiTags('beneficiaries')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('beneficiaries')
export class BeneficiaryController {
  constructor(private readonly svc: BeneficiaryService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Save a beneficiary (after a successful transfer)' })
  @ApiBody({ type: CreateBeneficiaryDtoSwagger })
  async create(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(CreateBeneficiarySchema)) dto: any) {
    return this.svc.create(user.userId, dto);
  }

  @Get('recent')
  @ApiOperation({ summary: 'Get recent/frequent beneficiaries for quick selection' })
  async recent(@CurrentUser() user: AuthUser, @Query('limit') limit = 10) {
    return this.svc.recent(user.userId, Number(limit));
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Remove a saved beneficiary' })
  async remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.svc.remove(user.userId, id);
  }
}
