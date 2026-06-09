import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query, Req } from '@nestjs/common';
import { Request } from 'express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { AdminKycService } from './admin-kyc.service';
import { AdminAuth } from '../decorators/admin-auth.decorator';
import { AdminPermission } from '../decorators/admin-permission.decorator';
import { ADMIN_PERMISSIONS } from '../constants/permissions.constant';
import { AdminKycQueryDto } from './dto/admin-kyc-query.dto';
import { AdminKycRejectDto } from './dto/admin-kyc-reject.dto';

@ApiTags('Admin KYC')
@Controller('admin/kyc')
export class AdminKycController {
  constructor(private readonly kycService: AdminKycService) {}

  /**
   * Pending KYC submissions queue
   */
  @Get('queue')
  @AdminAuth()
  @AdminPermission(ADMIN_PERMISSIONS.KYC_READ)
  @ApiOperation({
    summary: 'Get pending KYC submissions queue',
    description:
      'Paginated, oldest-first list of KYC documents awaiting review (not yet verified or rejected), joined with the submitting user. ' +
      'Only returns fields that actually exist on KYCDocument/User — riskScore/faceMatchPct/expiryDate/nationality/avatarCode are NOT included ' +
      '(they are not modeled in the schema; fabricating them would produce another mock-shaped illusion of real data). Requires kyc:read permission.',
  })
  @ApiBearerAuth()
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20 })
  @ApiQuery({ name: 'offset', required: false, type: Number, example: 0 })
  @ApiResponse({ status: 200, description: 'Pending KYC queue' })
  async getQueue(@Query() query: AdminKycQueryDto) {
    return this.kycService.getQueue(query);
  }

  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  @AdminAuth()
  @AdminPermission(ADMIN_PERMISSIONS.KYC_APPROVE)
  @ApiOperation({
    summary: 'Approve a KYC submission',
    description:
      'Sets KYCDocument.verifiedAt, upgrades User.kycStatus to VERIFIED and kycTier to TIER_2, writes audit log. Requires kyc:approve permission.',
  })
  @ApiBearerAuth()
  @ApiResponse({ status: 200, description: 'KYC approved' })
  @ApiResponse({ status: 400, description: 'Already approved or previously rejected' })
  @ApiResponse({ status: 404, description: 'KYC submission not found' })
  async approveKyc(@Param('id') id: string, @Req() req: Request) {
    return this.kycService.approveKyc(id, (req.user as { id: string }).id);
  }

  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  @AdminAuth()
  @AdminPermission(ADMIN_PERMISSIONS.KYC_REJECT)
  @ApiOperation({
    summary: 'Reject a KYC submission',
    description:
      'Sets KYCDocument.rejectedAt + rejectionReason, sets User.kycStatus to REJECTED, writes audit log. Requires kyc:reject permission.',
  })
  @ApiBearerAuth()
  @ApiResponse({ status: 200, description: 'KYC rejected' })
  @ApiResponse({ status: 400, description: 'Already approved or rejected' })
  @ApiResponse({ status: 404, description: 'KYC submission not found' })
  async rejectKyc(@Param('id') id: string, @Body() dto: AdminKycRejectDto, @Req() req: Request) {
    return this.kycService.rejectKyc(id, (req.user as { id: string }).id, dto);
  }
}
