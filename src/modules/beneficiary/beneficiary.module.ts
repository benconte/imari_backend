import { Module } from '@nestjs/common';
import { BeneficiaryController } from './beneficiary.controller';
import { BeneficiaryService } from './beneficiary.service';
import { PrismaService } from '@common/prisma/prisma.service';

@Module({
  controllers: [BeneficiaryController],
  providers: [BeneficiaryService, PrismaService],
  exports: [BeneficiaryService],
})
export class BeneficiaryModule {}
