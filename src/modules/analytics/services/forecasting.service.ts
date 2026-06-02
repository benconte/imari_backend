import { Injectable } from '@nestjs/common';
import { SpendingCategory, TransactionStatus, TransactionType } from '@prisma/client';
import { PrismaService } from '@common/prisma/prisma.service';
import { ForecastResponseDto } from '../dto/analytics.dto';

const EXPENSE_TYPES_EXCLUDE: TransactionType[] = [
  TransactionType.VAULT_CONTRIBUTION,
  TransactionType.REVERSAL,
  TransactionType.REFUND,
];

@Injectable()
export class ForecastingService {
  constructor(private readonly prisma: PrismaService) {}

  async forecastCurrentMonth(userId: string): Promise<ForecastResponseDto[]> {
    const now = new Date();
    const windowStart = new Date(now);
    windowStart.setDate(windowStart.getDate() - 90);

    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const daysInMonth = (monthEnd.getTime() - monthStart.getTime()) / 86_400_000;
    const daysPassed = Math.max(1, (now.getTime() - monthStart.getTime()) / 86_400_000);
    const daysRemaining = daysInMonth - daysPassed;

    // Get all expense transactions in the 90-day rolling window
    const transactions = await this.prisma.transaction.findMany({
      where: {
        senderId: userId,
        type: { notIn: EXPENSE_TYPES_EXCLUDE },
        status: TransactionStatus.COMPLETED,
        createdAt: { gte: windowStart, lt: now },
      },
      select: {
        amount: true,
        category: true,
        merchantName: true,
        type: true,
        categorySource: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    // Group by category → daily average over 90 days
    const categoryTotals: Record<string, number> = {};
    for (const tx of transactions) {
      const cat = (tx.category as string) ?? 'OTHER';
      categoryTotals[cat] = (categoryTotals[cat] ?? 0) + Number(tx.amount);
    }

    // Get month-to-date spending per category (for "spentSoFar")
    const mtdTransactions = await this.prisma.transaction.findMany({
      where: {
        senderId: userId,
        type: { notIn: EXPENSE_TYPES_EXCLUDE },
        status: TransactionStatus.COMPLETED,
        createdAt: { gte: monthStart, lt: now },
      },
      select: { amount: true, category: true },
    });

    const mtdByCategory: Record<string, number> = {};
    for (const tx of mtdTransactions) {
      const cat = (tx.category as string) ?? 'OTHER';
      mtdByCategory[cat] = (mtdByCategory[cat] ?? 0) + Number(tx.amount);
    }

    const forecasts: ForecastResponseDto[] = [];

    for (const [category, total90d] of Object.entries(categoryTotals)) {
      if (total90d === 0) continue;

      const dailyAvg = total90d / 90;
      const projectedMonthlySpend = dailyAvg * daysInMonth;
      const spentSoFar = mtdByCategory[category] ?? 0;

      // Linear projection: remaining projected = dailyAvg * daysRemaining
      const remainingProjected = Math.max(0, dailyAvg * daysRemaining);

      forecasts.push({
        category,
        projectedMonthlySpend: +projectedMonthlySpend.toFixed(2),
        spentSoFar: +spentSoFar.toFixed(2),
        remainingProjected: +remainingProjected.toFixed(2),
      });
    }

    // Sort by projected spend descending
    return forecasts.sort((a, b) => b.projectedMonthlySpend - a.projectedMonthlySpend);
  }

  async forecastCategory(
    userId: string,
    category: SpendingCategory,
  ): Promise<ForecastResponseDto | null> {
    const all = await this.forecastCurrentMonth(userId);
    return all.find((f) => f.category === category) ?? null;
  }
}
