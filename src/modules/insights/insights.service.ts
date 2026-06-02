// src/modules/insights/insights.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@common/prisma/prisma.service';
import { Prisma, FinancialInsight } from '@prisma/client';
import { startOfMonth, subMonths, endOfMonth, startOfDay, endOfDay, addMonths } from 'date-fns';

/**
 * Service that contains the core logic for generating financial insights.
 * All insight generation methods return arrays of Prisma.FinancialInsightCreateManyInput
 * objects ready to be persisted via Prisma's createMany.
 */
@Injectable()
export class InsightsService {
  private readonly logger = new Logger(InsightsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Entry point – generate all insight types for all users */
  async generateAllInsights(): Promise<void> {
    try {
      const users = await this.prisma.user.findMany({ select: { id: true } });
      for (const { id: userId } of users) {
        const insights: Prisma.FinancialInsightCreateManyInput[] = [];
        insights.push(...(await this.generateSpendingPattern(userId)));
        insights.push(...(await this.generateBudgetWarnings(userId)));
        insights.push(...(await this.generateSavingOpportunities(userId)));
        insights.push(...(await this.generateSubscriptionAlerts(userId)));
        const newInsights = await this.filterDuplicates(insights);
        if (newInsights.length) {
          await this.prisma.financialInsight.createMany({ data: newInsights as any });
        }
      }
    } catch (err) {
      this.logger.error('Failed to generate insights', err);
    }
  }

  /** ------------------------------------------------------------
   *  SPENDING_PATTERN
   * ------------------------------------------------------------ */
  private async generateSpendingPattern(userId: string): Promise<Prisma.FinancialInsightCreateManyInput[]> {
    const now = new Date();
    const currentMonthStart = startOfMonth(now);
    const previousMonthStart = startOfMonth(subMonths(now, 1));
    const previousMonthEnd = endOfMonth(subMonths(now, 1));

    const [currentAgg, previousAgg] = await Promise.all([
      this.prisma.transaction.aggregate({
        where: {
          senderId: userId,
          createdAt: { gte: currentMonthStart },
        },
        _sum: { amount: true },
      }),
      this.prisma.transaction.aggregate({
        where: {
          senderId: userId,
          createdAt: { gte: previousMonthStart, lte: previousMonthEnd },
        },
        _sum: { amount: true },
      }),
    ]);

    const cur = Number(currentAgg._sum?.amount ?? 0);
    const prev = Number(previousAgg._sum?.amount ?? 0);
    
    // If there's any spending this month and minimal/no spending last month, suggest tracking
    if (cur > 0 && prev === 0) {
      return [
        {
          userId,
          title: 'You have started spending',
          body: `You've spent ${cur.toFixed(2)} this month. Keep tracking to build your spending patterns.`,
          insightType: 'SPENDING_PATTERN',
          priority: 1,
          isRead: false,
          isDismissed: false,
          expiresAt: null,
          actionUrl: null,
          metadata: {
            currentMonthSpending: cur,
            confidence: 0.6,
          },
          createdAt: new Date(),
        } as Prisma.FinancialInsightCreateManyInput,
      ];
    }
    
    if (prev === 0) return [];
    const increase = (cur - prev) / prev;
    if (increase > 0.2) {
      return [
        {
          userId,
          title: 'Spending pattern changed',
          body: `Your spending this month increased by ${(increase * 100).toFixed(1)}% compared to last month.`,
          insightType: 'SPENDING_PATTERN',
          priority: 1,
          isRead: false,
          isDismissed: false,
          expiresAt: null,
          actionUrl: null,
          metadata: {
            period: `${previousMonthStart.toISOString().slice(0, 7)} vs ${currentMonthStart.toISOString().slice(0, 7)}`,
            currentMonthSpending: cur,
            previousMonthSpending: prev,
            confidence: 0.8,
          },
          createdAt: new Date(),
        } as Prisma.FinancialInsightCreateManyInput,
      ];
    }
    return [];
  }

  /** ------------------------------------------------------------
   *  BUDGET_WARNING
   * ------------------------------------------------------------ */
  private async generateBudgetWarnings(userId: string): Promise<Prisma.FinancialInsightCreateManyInput[]> {
    const budgets = await this.prisma.budget.findMany({
      where: { userId, startDate: { lte: new Date() }, endDate: { gte: new Date() } },
      include: { categoryBudgets: true },
    });
    const insights: Prisma.FinancialInsightCreateManyInput[] = [];
    for (const budget of budgets) {
      for (const catBud of budget.categoryBudgets) {
        const spentAgg = await this.prisma.transaction.aggregate({
          where: {
            OR: [{ senderId: userId }, { receiverId: userId }],
            category: catBud.category,
            createdAt: { gte: budget.startDate, lte: budget.endDate ?? new Date() },
          },
          _sum: { amount: true },
        });
        const spent = Number(spentAgg._sum?.amount ?? 0);
        const limit = Number(catBud.limit);
        const ratio = spent / limit;
        if (ratio >= 1) {
          insights.push({
            userId,
            title: 'Budget exceeded',
            body: `You have spent ${spent.toFixed(2)} which exceeds your budget of ${limit} for ${catBud.category}.`,
            insightType: 'BUDGET_WARNING',
            priority: 2,
            isRead: false,
            isDismissed: false,
            expiresAt: null,
            actionUrl: null,
            metadata: { budgetId: budget.id, category: catBud.category, spent, limit, confidence: 0.9 },
            createdAt: new Date(),
          } as Prisma.FinancialInsightCreateManyInput);
        } else if (ratio >= 0.8) {
          insights.push({
            userId,
            title: 'Budget nearing limit',
            body: `You have used ${(ratio * 100).toFixed(0)}% of your ${catBud.category} budget.`,
            insightType: 'BUDGET_WARNING',
            priority: 1,
            isRead: false,
            isDismissed: false,
            expiresAt: null,
            actionUrl: null,
            metadata: { budgetId: budget.id, category: catBud.category, spent, limit, confidence: 0.7 },
            createdAt: new Date(),
          } as Prisma.FinancialInsightCreateManyInput);
        }
      }
    }
    return insights;
  }

  /** ------------------------------------------------------------
   *  SAVING_OPPORTUNITY
   * ------------------------------------------------------------ */
  private async generateSavingOpportunities(userId: string): Promise<Prisma.FinancialInsightCreateManyInput[]> {
    const since = startOfDay(subMonths(new Date(), 0)); // today
    const txns = await this.prisma.transaction.groupBy({
      by: ['category'],
      where: { senderId: userId, createdAt: { gte: since } },
      _sum: { amount: true },
    });
    
    if (txns.length === 0) return [];
    
    const amounts = txns.map(g => Number(g._sum?.amount ?? 0));
    const avg = amounts.reduce((a, b) => a + b, 0) / amounts.length;
    const insights: Prisma.FinancialInsightCreateManyInput[] = [];
    
    // Generate insights for any transactions if just starting
    if (txns.length === 1) {
      const grp = txns[0];
      const catAmt = Number(grp._sum?.amount ?? 0);
      insights.push({
        userId,
        title: 'Transaction recorded',
        body: `You transferred ${catAmt.toFixed(2)} RWF. Keep tracking your spending to get personalized recommendations.`,
        insightType: 'SAVING_OPPORTUNITY',
        priority: 1,
        isRead: false,
        isDismissed: false,
        expiresAt: null,
        actionUrl: null,
        metadata: { category: grp.category, amount: catAmt, confidence: 0.5 },
        createdAt: new Date(),
      } as Prisma.FinancialInsightCreateManyInput);
      return insights;
    }
    
    // For multiple categories, find outliers
    for (const grp of txns) {
      const catAmt = Number(grp._sum?.amount ?? 0);
      if (catAmt > avg * 1.5) {
        insights.push({
          userId,
          title: 'Saving opportunity',
          body: `You spend ${catAmt.toFixed(2)} on ${grp.category}, which is higher than your average category spend. Consider reviewing this expense.`,
          insightType: 'SAVING_OPPORTUNITY',
          priority: 1,
          isRead: false,
          isDismissed: false,
          expiresAt: null,
          actionUrl: null,
          metadata: { category: grp.category, amount: catAmt, confidence: 0.6 },
          createdAt: new Date(),
        } as Prisma.FinancialInsightCreateManyInput);
      }
    }
    return insights;
  }

  /** ------------------------------------------------------------
   *  SUBSCRIPTION_ALERT
   * ------------------------------------------------------------ */
  private async generateSubscriptionAlerts(userId: string): Promise<Prisma.FinancialInsightCreateManyInput[]> {
    const threeMonthsAgo = subMonths(new Date(), 3);
    const recurring = await this.prisma.$queryRaw<Array<{ merchant: string; amount: string; count: number }>>`
      SELECT "merchantName" as merchant, CAST(amount AS TEXT) as amount, COUNT(*) as count
      FROM "transactions"
      WHERE ("senderId" = ${userId} OR "receiverId" = ${userId})
        AND "createdAt" >= ${threeMonthsAgo}
      GROUP BY "merchantName", amount
      HAVING COUNT(*) >= 2`
    ;
    const insights: Prisma.FinancialInsightCreateManyInput[] = [];
    for (const rec of recurring) {
      const nextCharge = addMonths(new Date(), 1);
      insights.push({
        userId,
        title: 'Upcoming subscription',
        body: `You have a recurring payment of ${rec.amount} to ${rec.merchant}. Next charge expected around ${nextCharge.toDateString()}.`,
        insightType: 'SUBSCRIPTION_ALERT',
        priority: 1,
        isRead: false,
        isDismissed: false,
        expiresAt: null,
        actionUrl: null,
        metadata: { merchant: rec.merchant, amount: rec.amount, nextCharge: nextCharge.toISOString(), confidence: 0.7 },
        createdAt: new Date(),
      } as Prisma.FinancialInsightCreateManyInput);
    }
    return insights;
  }

  /** ------------------------------------------------------------
   *  Duplicate prevention – keep only insights that do not already exist
   * ------------------------------------------------------------ */
  private async filterDuplicates(insights: Prisma.FinancialInsightCreateManyInput[]): Promise<Prisma.FinancialInsightCreateManyInput[]> {
    const toCreate: Prisma.FinancialInsightCreateManyInput[] = [];
    for (const insight of insights) {
      // Check if this exact insight already exists based on userId, type and today's date
      const exists = await this.prisma.financialInsight.findFirst({
        where: {
          userId: insight.userId,
          insightType: insight.insightType,
          createdAt: { gte: startOfDay(new Date()), lte: endOfDay(new Date()) },
        },
      });
      if (!exists) {
        toCreate.push(insight);
      }
    }
    return toCreate;
  }

  /** ============================================================
   *  PUBLIC API METHODS FOR CONTROLLER
   * ============================================================ */

  /** Get all insights for a user with optional filters */
  async getUserInsights(
    userId: string,
    filters?: {
      type?: string;
      isRead?: boolean;
      isDismissed?: boolean;
    },
  ): Promise<FinancialInsight[]> {
    const where: Prisma.FinancialInsightWhereInput = {
      userId,
      ...(filters?.type && { insightType: filters.type }),
      ...(filters?.isRead !== undefined && { isRead: filters.isRead }),
      ...(filters?.isDismissed !== undefined && { isDismissed: filters.isDismissed }),
    };

    return this.prisma.financialInsight.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Get a specific insight by ID and verify ownership */
  async getInsightById(userId: string, insightId: string): Promise<FinancialInsight> {
    const insight = await this.prisma.financialInsight.findFirst({
      where: {
        id: insightId,
        userId,
      },
    });

    if (!insight) {
      throw new Error('Insight not found');
    }

    return insight;
  }

  /** Mark an insight as read */
  async markAsRead(userId: string, insightId: string): Promise<FinancialInsight> {
    const insight = await this.getInsightById(userId, insightId);

    return this.prisma.financialInsight.update({
      where: { id: insight.id },
      data: { isRead: true },
    });
  }

  /** Dismiss an insight */
  async dismissInsight(userId: string, insightId: string): Promise<FinancialInsight> {
    const insight = await this.getInsightById(userId, insightId);

    return this.prisma.financialInsight.update({
      where: { id: insight.id },
      data: { isDismissed: true },
    });
  }

  /** Delete all insights for a user */
  async deleteUserInsights(userId: string): Promise<void> {
    await this.prisma.financialInsight.deleteMany({
      where: { userId },
    });
    this.logger.log(`All insights deleted for user ${userId}`);
  }

  /** Generate all real insights for a single user based on their actual data */
  async generateUserInsights(userId: string): Promise<number> {
    const insights: Prisma.FinancialInsightCreateManyInput[] = [];
    insights.push(...(await this.generateSpendingPattern(userId)));
    insights.push(...(await this.generateBudgetWarnings(userId)));
    insights.push(...(await this.generateSavingOpportunities(userId)));
    insights.push(...(await this.generateSubscriptionAlerts(userId)));
    
    const newInsights = await this.filterDuplicates(insights);
    if (newInsights.length) {
      await this.prisma.financialInsight.createMany({ data: newInsights as any });
    }
    
    this.logger.log(`Generated ${newInsights.length} real insights for user ${userId}`);
    return newInsights.length;
  }

  /** ============================================================
   *  DEMO/TEST METHOD - Generate sample insights for testing
   * ============================================================ */
  async generateDemoInsights(userId: string): Promise<void> {
    const demoInsights: Prisma.FinancialInsightCreateManyInput[] = [
      {
        userId,
        title: 'Saving opportunity',
        body: 'You spend 12,500 RWF on ENTERTAINMENT, which is 45% higher than your average category spend. Consider reviewing this expense.',
        insightType: 'SAVING_OPPORTUNITY',
        priority: 1,
        isRead: false,
        isDismissed: false,
        expiresAt: null,
        actionUrl: null,
        metadata: {
          category: 'ENTERTAINMENT',
          amount: 12500,
          confidence: 0.75,
        },
        createdAt: new Date(),
      },
      {
        userId,
        title: 'Budget nearing limit',
        body: 'You have used 82% of your FOOD budget (8,200 RWF out of 10,000 RWF).',
        insightType: 'BUDGET_WARNING',
        priority: 1,
        isRead: false,
        isDismissed: false,
        expiresAt: null,
        actionUrl: null,
        metadata: {
          budgetId: 'demo-budget-001',
          category: 'FOOD',
          spent: 8200,
          limit: 10000,
          confidence: 0.85,
        },
        createdAt: new Date(),
      },
      {
        userId,
        title: 'Upcoming subscription',
        body: 'You have a recurring payment of 5,000 RWF to Netflix. Next charge expected around June 5, 2026.',
        insightType: 'SUBSCRIPTION_ALERT',
        priority: 1,
        isRead: false,
        isDismissed: false,
        expiresAt: null,
        actionUrl: null,
        metadata: {
          merchant: 'Netflix',
          amount: '5000',
          nextCharge: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000).toISOString(),
          confidence: 0.9,
        },
        createdAt: new Date(),
      },
      {
        userId,
        title: 'Spending pattern changed',
        body: 'Your spending this month increased by 28% compared to last month.',
        insightType: 'SPENDING_PATTERN',
        priority: 1,
        isRead: false,
        isDismissed: false,
        expiresAt: null,
        actionUrl: null,
        metadata: {
          period: '2026-05 vs 2026-06',
          currentMonthSpending: 128000,
          previousMonthSpending: 100000,
          confidence: 0.88,
        },
        createdAt: new Date(),
      },
    ];

    // Delete old demo insights for this user to avoid duplicates
    await this.prisma.financialInsight.deleteMany({
      where: {
        userId,
      },
    });

    // Create demo insights
    await this.prisma.financialInsight.createMany({
      data: demoInsights as any,
      skipDuplicates: true,
    });

    this.logger.log(`Demo insights created for user ${userId}`);
  }
}
