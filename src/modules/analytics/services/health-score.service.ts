import { Injectable } from '@nestjs/common';
import { TransactionStatus, TransactionType } from '@prisma/client';
import { PrismaService } from '@common/prisma/prisma.service';
import { HealthScoreResponseDto } from '../dto/analytics.dto';

// Score weights — must sum to 100
const WEIGHTS = {
  savingsRate: 30,
  expenseVolatility: 20,
  budgetAdherence: 30,
  emergencyFund: 20,
};

@Injectable()
export class HealthScoreService {
  constructor(private readonly prisma: PrismaService) {}

  async computeHealthScore(userId: string): Promise<HealthScoreResponseDto> {
    const [savingsRateScore, expenseVolatilityScore, budgetAdherenceScore, emergencyFundScore] =
      await Promise.all([
        this.scoreSavingsRate(userId),
        this.scoreExpenseVolatility(userId),
        this.scoreBudgetAdherence(userId),
        this.scoreEmergencyFund(userId),
      ]);

    const overall =
      savingsRateScore +
      expenseVolatilityScore +
      budgetAdherenceScore +
      emergencyFundScore;

    // Persist updated score on user record
    await this.prisma.user.update({
      where: { id: userId },
      data: { financialHealthScore: +overall.toFixed(1) },
    });

    return {
      overall: +overall.toFixed(1),
      savingsRateScore: +savingsRateScore.toFixed(1),
      expenseVolatilityScore: +expenseVolatilityScore.toFixed(1),
      budgetAdherenceScore: +budgetAdherenceScore.toFixed(1),
      emergencyFundScore: +emergencyFundScore.toFixed(1),
    };
  }

  // Savings rate: % of income saved. ≥20% earns full 30 pts.
  private async scoreSavingsRate(userId: string): Promise<number> {
    const now = new Date();
    const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1);

    const [incomeResult, savingsResult] = await Promise.all([
      this.prisma.transaction.aggregate({
        where: {
          receiverId: userId,
          type: { in: [TransactionType.DEPOSIT, TransactionType.REFUND] },
          status: TransactionStatus.COMPLETED,
          createdAt: { gte: threeMonthsAgo },
        },
        _sum: { netAmount: true },
      }),
      this.prisma.transaction.aggregate({
        where: {
          senderId: userId,
          type: TransactionType.VAULT_CONTRIBUTION,
          status: TransactionStatus.COMPLETED,
          createdAt: { gte: threeMonthsAgo },
        },
        _sum: { amount: true },
      }),
    ]);

    const totalIncome = Number(incomeResult._sum.netAmount ?? 0);
    const totalSaved = Number(savingsResult._sum.amount ?? 0);
    if (totalIncome === 0) return 0;

    const savingsRate = (totalSaved / totalIncome) * 100;
    // 20% → 30pts, linear below
    const rawScore = Math.min(savingsRate / 20, 1) * WEIGHTS.savingsRate;
    return rawScore;
  }

  // Expense volatility: coefficient of variation across last 6 months.
  // Lower CV → higher score. CV = stddev / mean.
  private async scoreExpenseVolatility(userId: string): Promise<number> {
    const now = new Date();
    const monthlyTotals: number[] = [];

    for (let i = 0; i < 6; i++) {
      const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);

      const result = await this.prisma.transaction.aggregate({
        where: {
          senderId: userId,
          type: {
            notIn: [TransactionType.VAULT_CONTRIBUTION, TransactionType.REVERSAL, TransactionType.REFUND],
          },
          status: TransactionStatus.COMPLETED,
          createdAt: { gte: start, lt: end },
        },
        _sum: { amount: true },
      });

      monthlyTotals.push(Number(result._sum.amount ?? 0));
    }

    const nonZero = monthlyTotals.filter((v) => v > 0);
    if (nonZero.length < 2) return WEIGHTS.expenseVolatility * 0.5; // neutral

    const mean = nonZero.reduce((a, b) => a + b, 0) / nonZero.length;
    const variance =
      nonZero.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / nonZero.length;
    const stddev = Math.sqrt(variance);
    const cv = stddev / mean; // 0 = perfect stability, >1 = very volatile

    // CV ≤ 0.1 → full score; CV ≥ 1.0 → 0
    const stabilityRatio = Math.max(0, 1 - cv);
    return stabilityRatio * WEIGHTS.expenseVolatility;
  }

  // Budget adherence: ratio of category budgets within limit
  private async scoreBudgetAdherence(userId: string): Promise<number> {
    const budgets = await this.prisma.budget.findMany({
      where: {
        userId,
        status: { in: ['ACTIVE', 'PAUSED'] },
      },
      include: { categoryBudgets: true },
    });

    if (budgets.length === 0) return WEIGHTS.budgetAdherence * 0.5; // no budgets = neutral

    let totalCategories = 0;
    let withinLimit = 0;

    for (const budget of budgets) {
      for (const cb of budget.categoryBudgets) {
        totalCategories++;
        const ratio = Number(cb.spent) / Number(cb.limit);
        if (ratio <= 1.0) withinLimit++;
      }
    }

    if (totalCategories === 0) return WEIGHTS.budgetAdherence * 0.5;
    return (withinLimit / totalCategories) * WEIGHTS.budgetAdherence;
  }

  // Emergency fund: total savings / average monthly expenses.
  // 3× monthly expenses → full score. 0 → no score.
  private async scoreEmergencyFund(userId: string): Promise<number> {
    const now = new Date();
    const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1);

    const [savingsBalance, expenseResult] = await Promise.all([
      this.prisma.savingsVault.aggregate({
        where: { userId, status: { not: 'CANCELLED' } },
        _sum: { currentAmount: true },
      }),
      this.prisma.transaction.aggregate({
        where: {
          senderId: userId,
          type: {
            notIn: [TransactionType.VAULT_CONTRIBUTION, TransactionType.REVERSAL, TransactionType.REFUND],
          },
          status: TransactionStatus.COMPLETED,
          createdAt: { gte: threeMonthsAgo },
        },
        _sum: { amount: true },
      }),
    ]);

    const totalSavings = Number(savingsBalance._sum.currentAmount ?? 0);
    const totalExpenses3Mo = Number(expenseResult._sum.amount ?? 0);
    const avgMonthlyExpenses = totalExpenses3Mo / 3;

    if (avgMonthlyExpenses === 0) return totalSavings > 0 ? WEIGHTS.emergencyFund : 0;

    const fundRatio = totalSavings / avgMonthlyExpenses;
    // 3× monthly expenses = full score
    const score = Math.min(fundRatio / 3, 1) * WEIGHTS.emergencyFund;
    return score;
  }
}
