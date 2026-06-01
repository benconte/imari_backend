import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '@common/prisma/prisma.service';
import { AnalyticsSnapshotService } from '../services/analytics-snapshot.service';
import { InsightGeneratorService } from '../services/insight-generator.service';
import { HealthScoreService } from '../services/health-score.service';

@Injectable()
export class AnalyticsSnapshotCron {
  private readonly logger = new Logger(AnalyticsSnapshotCron.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly snapshotService: AnalyticsSnapshotService,
    private readonly insightService: InsightGeneratorService,
    private readonly healthScoreService: HealthScoreService,
  ) {}

  // Run nightly at 00:05 to aggregate previous day / refresh current month snapshot
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async runNightlySnapshots() {
    this.logger.log('Starting nightly analytics snapshot run...');

    const users = await this.prisma.user.findMany({
      where: { status: 'ACTIVE', deletedAt: null },
      select: { id: true },
    });

    this.logger.log(`Processing ${users.length} active users`);

    let successCount = 0;
    let errorCount = 0;

    for (const user of users) {
      try {
        await this.processUserSnapshot(user.id);
        successCount++;
      } catch (err) {
        errorCount++;
        this.logger.error(`Snapshot failed for user ${user.id}: ${(err as Error).message}`);
      }
    }

    this.logger.log(
      `Nightly snapshot complete — success: ${successCount}, errors: ${errorCount}`,
    );
  }

  async processUserSnapshot(userId: string) {
    const { start: currStart, end: currEnd } = this.snapshotService.currentMonthBounds();
    const { start: prevStart, end: prevEnd } = this.snapshotService.lastMonthBounds();

    // Compute current month (always refreshed)
    const currSnapshot = await this.snapshotService.computeAndUpsertSnapshot(
      userId,
      currStart,
      currEnd,
    );

    // Compute last month if not yet finalized
    const lastMonthDone = new Date() > prevEnd;
    if (lastMonthDone) {
      const existing = await this.prisma.analyticsSnapshot.findUnique({
        where: {
          userId_periodStart_periodEnd: { userId, periodStart: prevStart, periodEnd: prevEnd },
        },
      });
      if (!existing) {
        await this.snapshotService.computeAndUpsertSnapshot(userId, prevStart, prevEnd);
      }
    }

    // Attach % change vs previous month to current snapshot
    const prevSnapshot = await this.prisma.analyticsSnapshot.findUnique({
      where: {
        userId_periodStart_periodEnd: { userId, periodStart: prevStart, periodEnd: prevEnd },
      },
    });

    if (prevSnapshot) {
      const currSpending = (currSnapshot.spendingByCategory as Record<string, number>) ?? {};
      const prevSpending = (prevSnapshot.spendingByCategory as Record<string, number>) ?? {};
      const comparedToPrevious: Record<string, number | null> = {};

      for (const [cat, amt] of Object.entries(currSpending)) {
        const prev = prevSpending[cat] ?? 0;
        comparedToPrevious[cat] = prev > 0 ? +((((amt - prev) / prev) * 100).toFixed(1)) : null;
      }

      await this.prisma.analyticsSnapshot.update({
        where: { id: currSnapshot.id },
        data: { comparedToPrevious },
      });
    }

    // Update health score
    await this.healthScoreService.computeHealthScore(userId);

    // Refresh insights
    await this.insightService.generateAndPersistInsights(userId);
  }
}
