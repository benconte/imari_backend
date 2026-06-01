import { Injectable, Logger } from '@nestjs/common';
import { Prisma, TransactionStatus, TransactionType } from '@prisma/client';
import { PrismaService } from '@common/prisma/prisma.service';
import { AnalyticsSnapshotService } from './analytics-snapshot.service';

type InsightType =
  | 'SPENDING_PATTERN'
  | 'SAVING_OPPORTUNITY'
  | 'BUDGET_WARNING'
  | 'HEALTH_TIP'
  | 'SUBSCRIPTION_ALERT';

interface InsightCandidate {
  title: string;
  body: string;
  insightType: InsightType;
  priority: number;
  expiresAt?: Date;
  actionUrl?: string;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class InsightGeneratorService {
  private readonly logger = new Logger(InsightGeneratorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly snapshotService: AnalyticsSnapshotService,
  ) {}

  async generateAndPersistInsights(userId: string): Promise<number> {
    const { start: currStart, end: currEnd } = this.snapshotService.currentMonthBounds();
    const { start: prevStart, end: prevEnd } = this.snapshotService.lastMonthBounds();

    const [currSnapshot, prevSnapshot] = await Promise.all([
      this.snapshotService.getOrComputeSnapshot(userId, currStart, currEnd),
      this.snapshotService.getOrComputeSnapshot(userId, prevStart, prevEnd),
    ]);

    const candidates: InsightCandidate[] = [];
    const expiresAt = currEnd; // insights expire at end of current month

    // 1. Spending surge by category (>25% increase vs last month)
    const currSpending = (currSnapshot.spendingByCategory as Record<string, number>) ?? {};
    const prevSpending = (prevSnapshot.spendingByCategory as Record<string, number>) ?? {};

    for (const [category, currAmt] of Object.entries(currSpending)) {
      const prevAmt = prevSpending[category] ?? 0;
      if (prevAmt === 0) continue;
      const pctChange = ((currAmt - prevAmt) / prevAmt) * 100;

      if (pctChange >= 25) {
        const label = category.replace(/_/g, ' ').toLowerCase();
        candidates.push({
          title: `${this.titleCase(label)} spend is up ${Math.round(pctChange)}%`,
          body: `Your ${label} spending rose from RWF ${this.fmt(prevAmt)} to RWF ${this.fmt(currAmt)} compared to last month.`,
          insightType: 'SPENDING_PATTERN',
          priority: pctChange >= 50 ? 3 : 2,
          expiresAt,
          metadata: { category, pctChange, prevAmt, currAmt },
        });
      }
    }

    // 2. No savings this month
    if (currSnapshot.totalSaved.toNumber() === 0) {
      candidates.push({
        title: "You haven't saved anything yet this month",
        body: "Consider moving even a small amount to a savings vault to build your emergency fund.",
        insightType: 'SAVING_OPPORTUNITY',
        priority: 3,
        expiresAt,
        actionUrl: '/savings',
      });
    }

    // 3. Low savings rate (<5%)
    if (
      currSnapshot.savingsRate < 5 &&
      currSnapshot.totalIncome.toNumber() > 0 &&
      currSnapshot.totalSaved.toNumber() > 0
    ) {
      candidates.push({
        title: `Your savings rate is only ${currSnapshot.savingsRate.toFixed(1)}%`,
        body: "Financial experts recommend saving at least 20% of your income. Try setting up an automatic savings rule.",
        insightType: 'SAVING_OPPORTUNITY',
        priority: 2,
        expiresAt,
        actionUrl: '/savings/rules',
      });
    }

    // 4. Budget warnings (spending ≥80% of limit in any category)
    const budgets = await this.prisma.budget.findMany({
      where: { userId, status: 'ACTIVE' },
      include: { categoryBudgets: true },
    });

    for (const budget of budgets) {
      for (const cb of budget.categoryBudgets) {
        const ratio = Number(cb.spent) / Number(cb.limit);
        if (ratio >= 0.8 && ratio < 1.0) {
          const label = String(cb.category).replace(/_/g, ' ').toLowerCase();
          candidates.push({
            title: `You've used ${Math.round(ratio * 100)}% of your ${this.titleCase(label)} budget`,
            body: `You have RWF ${this.fmt(Number(cb.limit) - Number(cb.spent))} remaining in your ${label} budget for this period.`,
            insightType: 'BUDGET_WARNING',
            priority: ratio >= 0.95 ? 4 : 3,
            expiresAt,
            metadata: { budgetId: budget.id, category: cb.category, ratio },
          });
        } else if (ratio >= 1.0) {
          const label = String(cb.category).replace(/_/g, ' ').toLowerCase();
          candidates.push({
            title: `You've exceeded your ${this.titleCase(label)} budget`,
            body: `Your ${label} spending has exceeded the limit by RWF ${this.fmt(Number(cb.spent) - Number(cb.limit))}.`,
            insightType: 'BUDGET_WARNING',
            priority: 5,
            expiresAt,
            metadata: { budgetId: budget.id, category: cb.category, ratio },
          });
        }
      }
    }

    // 5. Subscription alert: total subscription charges this month
    const subResult = await this.prisma.transaction.aggregate({
      where: {
        senderId: userId,
        type: TransactionType.SUBSCRIPTION_CHARGE,
        status: TransactionStatus.COMPLETED,
        createdAt: { gte: currStart, lt: currEnd },
      },
      _sum: { amount: true },
      _count: { id: true },
    });

    const subTotal = Number(subResult._sum.amount ?? 0);
    const subCount = subResult._count.id;
    if (subTotal > 0 && subCount >= 2) {
      candidates.push({
        title: `RWF ${this.fmt(subTotal)} in subscription charges this month`,
        body: `You have ${subCount} active subscription charges totalling RWF ${this.fmt(subTotal)}. Review subscriptions you may no longer use.`,
        insightType: 'SUBSCRIPTION_ALERT',
        priority: 2,
        expiresAt,
        actionUrl: '/transactions?type=SUBSCRIPTION_CHARGE',
        metadata: { subTotal, subCount },
      });
    }

    // 6. Income drop (>20% vs last month)
    const currIncome = currSnapshot.totalIncome.toNumber();
    const prevIncome = prevSnapshot.totalIncome.toNumber();
    if (prevIncome > 0 && currIncome < prevIncome * 0.8) {
      const drop = Math.round(((prevIncome - currIncome) / prevIncome) * 100);
      candidates.push({
        title: `Your income is down ${drop}% vs last month`,
        body: `Last month you received RWF ${this.fmt(prevIncome)}, but only RWF ${this.fmt(currIncome)} so far this month.`,
        insightType: 'HEALTH_TIP',
        priority: 3,
        expiresAt,
        metadata: { currIncome, prevIncome, drop },
      });
    }

    if (candidates.length === 0) {
      this.logger.debug(`No new insights for user ${userId}`);
      return 0;
    }

    // Dismiss expired insights and insert fresh ones
    await this.prisma.financialInsight.updateMany({
      where: { userId, isDismissed: false, expiresAt: { lt: new Date() } },
      data: { isDismissed: true },
    });

    await this.prisma.financialInsight.createMany({
      data: candidates.map((c) => ({
        userId,
        title: c.title,
        body: c.body,
        insightType: c.insightType,
        priority: c.priority,
        expiresAt: c.expiresAt ?? null,
        actionUrl: c.actionUrl ?? null,
        metadata: c.metadata ? (c.metadata as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
      })),
      skipDuplicates: false,
    });

    this.logger.debug(`Generated ${candidates.length} insights for user ${userId}`);
    return candidates.length;
  }

  async getInsightsForUser(userId: string, limit = 10) {
    return this.prisma.financialInsight.findMany({
      where: { userId, isDismissed: false },
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
      take: limit,
      select: {
        id: true,
        title: true,
        body: true,
        insightType: true,
        priority: true,
        isRead: true,
        expiresAt: true,
        actionUrl: true,
        createdAt: true,
      },
    });
  }

  async markInsightRead(insightId: string, userId: string) {
    return this.prisma.financialInsight.updateMany({
      where: { id: insightId, userId },
      data: { isRead: true },
    });
  }

  async dismissInsight(insightId: string, userId: string) {
    return this.prisma.financialInsight.updateMany({
      where: { id: insightId, userId },
      data: { isDismissed: true },
    });
  }

  private titleCase(str: string) {
    return str.replace(/\b\w/g, (c) => c.toUpperCase());
  }

  private fmt(n: number) {
    return n.toLocaleString('en-RW', { maximumFractionDigits: 0 });
  }
}
