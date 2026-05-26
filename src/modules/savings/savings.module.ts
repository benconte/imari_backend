import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { SavingsService } from './savings.service';
import { SavingsController } from './savings.controller';
import { PrismaService } from '@common/prisma/prisma.service';

@Module({
  imports: [ScheduleModule.forRoot()],
  controllers: [SavingsController],
  providers: [SavingsService, PrismaService],
})
export class SavingsModule {}
