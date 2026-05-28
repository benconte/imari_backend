import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, HttpCode, HttpStatus, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags, ApiBody } from '@nestjs/swagger';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { CurrentUser } from '@common/decorators/public.decorator';
import { AuthUser } from '@modules/auth/strategies/jwt.strategy';
import { VirtualCardService } from './virtual-card.service';
import {
  CreateVirtualCardDto,
  CreateVirtualCardSchema,
  UpdateVirtualCardDto,
  UpdateVirtualCardSchema,
  VirtualCardResponseDto,
  CreateVirtualCardDtoSwagger,
  AuthorizeTransactionDtoSwagger,
  CaptureTransactionDtoSwagger,
  ReverseTransactionDtoSwagger,
  AuthorizeTransactionSchema,
  AuthorizeTransactionDto,
  CaptureTransactionSchema,
  CaptureTransactionDto,
  ReverseTransactionSchema,
  ReverseTransactionDto,
} from './dto/virtual-card.dto';
import { ZodValidationPipe } from '@common/pipes/zod-validation.pipe';

@ApiTags('virtual-card')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('virtual-card')
export class VirtualCardController {
  constructor(private readonly vcService: VirtualCardService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create virtual card' })
  @ApiBody({ type: CreateVirtualCardDtoSwagger })
  @ApiResponse({ status: 201, type: VirtualCardResponseDto })
  async createVirtualCard(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(CreateVirtualCardSchema)) dto: CreateVirtualCardDto,
  ) {
    return this.vcService.createVirtualCard(user.userId, dto);
  }

  @Get()
  @ApiResponse({ status: 200, type: [VirtualCardResponseDto] })
  async getUserVirtualCards(@CurrentUser() user: AuthUser) {
    return this.vcService.getUserVirtualCards(user.userId);
  }

  @Get(':id')
  @ApiResponse({ status: 200, type: VirtualCardResponseDto })
  async getVirtualCardById(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    return this.vcService.getVirtualCardById(user.userId, id);
  }

  @Patch(':id')
  @ApiResponse({ status: 200, type: VirtualCardResponseDto })
  async updateVirtualCard(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateVirtualCardSchema)) dto: UpdateVirtualCardDto,
  ) {
    return this.vcService.updateVirtualCard(user.userId, id, dto);
  }

  @Patch(':id/freeze')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Freeze virtual card' })
  @ApiResponse({ status: 200, type: VirtualCardResponseDto })
  async freezeVirtualCard(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    return this.vcService.freezeVirtualCard(user.userId, id);
  }

  @Patch(':id/unfreeze')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Unfreeze virtual card' })
  @ApiResponse({ status: 200, type: VirtualCardResponseDto })
  async unfreezeVirtualCard(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    return this.vcService.unfreezeVirtualCard(user.userId, id);
  }

  @Post('authorize')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Authorize card transaction' })
  @ApiBody({ type: AuthorizeTransactionDtoSwagger })
  async authorizeTransaction(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(AuthorizeTransactionSchema)) dto: AuthorizeTransactionDto,
  ) {
    return this.vcService.authorizeTransaction(user.userId, dto);
  }

  @Post('capture')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Capture authorized transaction' })
  @ApiBody({ type: CaptureTransactionDtoSwagger })
  async captureTransaction(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(CaptureTransactionSchema)) dto: CaptureTransactionDto,
  ) {
    return this.vcService.captureTransaction(user.userId, dto);
  }

  @Post('reverse')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Reverse captured transaction' })
  @ApiBody({ type: ReverseTransactionDtoSwagger })
  async reverseTransaction(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(ReverseTransactionSchema)) dto: ReverseTransactionDto,
  ) {
    return this.vcService.reverseTransaction(user.userId, dto);
  }
}