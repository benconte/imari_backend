import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaService } from '@common/prisma/prisma.service';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsSnapshotService } from './services/analytics-snapshot.service';
import { CategorizationService } from './services/categorization.service';
import { HealthScoreService } from './services/health-score.service';
import { InsightGeneratorService } from './services/insight-generator.service';
import { ForecastingService } from './services/forecasting.service';
import { AnalyticsSnapshotCron } from './cron/analytics-snapshot.cron';

@Module({
  imports: [ScheduleModule.forRoot()],
  controllers: [AnalyticsController],
  providers: [
    PrismaService,
    CategorizationService,
    AnalyticsSnapshotService,
    HealthScoreService,
    InsightGeneratorService,
    ForecastingService,
    AnalyticsSnapshotCron,
  ],
  exports: [
    AnalyticsSnapshotService,
    CategorizationService,
    HealthScoreService,
    InsightGeneratorService,
    ForecastingService,
  ],
})
export class AnalyticsModule {}
