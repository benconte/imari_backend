import { Module } from '@nestjs/common';
import { PrismaModule } from 'src/common/prisma/prisma.module';
import { AdminModule } from '../admin.module';
import { AdminKycController } from './admin-kyc.controller';
import { AdminKycService } from './admin-kyc.service';

@Module({
  imports: [PrismaModule, AdminModule],
  controllers: [AdminKycController],
  providers: [AdminKycService],
})
export class AdminKycModule {}
