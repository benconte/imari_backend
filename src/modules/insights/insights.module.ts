import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { InsightsService } from './insights.service';
import { InsightsScheduler } from './insights.scheduler';
import { InsightsController } from './insights.controller';
import { PrismaService } from '@common/prisma/prisma.service';

@Module({
  imports: [ScheduleModule.forRoot()],
  controllers: [InsightsController],
  providers: [InsightsService, InsightsScheduler, PrismaService],
})
export class InsightsModule {}
