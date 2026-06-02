import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InsightsService } from './insights.service';

/**
 * Scheduler that periodically generates financial insights for all users.
 * Runs every hour to keep insights fresh based on transaction data.
 */
@Injectable()
export class InsightsScheduler {
  private readonly logger = new Logger(InsightsScheduler.name);

  constructor(private readonly insightsService: InsightsService) {}

  // Runs every hour at the top of the hour
  @Cron('0 * * * *')
  async generateInsightsHourly() {
    try {
      this.logger.log('Running hourly financial insights generation');
      await this.insightsService.generateAllInsights();
      this.logger.log('Financial insights generation completed');
    } catch (error) {
      this.logger.error('Failed to generate insights', error);
    }
  }
}
