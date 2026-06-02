import { Injectable, Logger } from '@nestjs/common';
import {
  TransactionStatus,
  TransactionType,
  SpendingCategory,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '@common/prisma/prisma.service';
import { CategorizationService } from './categorization.service';
import { CategoryBreakdownDto, MonthSummaryDto } from '../dto/analytics.dto';

const EXPENSE_TYPES: TransactionType[] = [
  TransactionType.WITHDRAWAL,
  TransactionType.MERCHANT_PAYMENT,
  TransactionType.QR_PAYMENT,
  TransactionType.CARD_PAYMENT,
  TransactionType.SUBSCRIPTION_CHARGE,
  TransactionType.FEE,
  TransactionType.P2P_TRANSFER,
  TransactionType.SCHEDULED_TRANSFER,
];

const INCOME_TYPES: TransactionType[] = [
  TransactionType.DEPOSIT,
  TransactionType.REFUND,
  TransactionType.P2P_TRANSFER,
];

@Injectable()
export class AnalyticsSnapshotService {
  private readonly logger = new Logger(AnalyticsSnapshotService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly categorization: CategorizationService,
  ) {}

  async computeAndUpsertSnapshot(userId: string, periodStart: Date, periodEnd: Date) {
    const transactions = await this.prisma.transaction.findMany({
      where: {
        OR: [{ senderId: userId }, { receiverId: userId }],
        status: TransactionStatus.COMPLETED,
        createdAt: { gte: periodStart, lt: periodEnd },
      },
      select: {
        id: true,
        type: true,
        direction: true,
        amount: true,
        netAmount: true,
        category: true,
        categorySource: true,
        merchantName: true,
        senderId: true,
        receiverId: true,
      },
    });

    let totalIncome = new Prisma.Decimal(0);
    let totalExpenses = new Prisma.Decimal(0);
    let totalSaved = new Prisma.Decimal(0);
    const spendingMap: Record<string, Prisma.Decimal> = {};
    let transactionCount = 0;

    for (const tx of transactions) {
      transactionCount++;
      const amount = new Prisma.Decimal(tx.amount.toString());
      const netAmount = new Prisma.Decimal(tx.netAmount.toString());

      // Income: money received by this user (deposit, refund, incoming P2P)
      if (
        tx.receiverId === userId &&
        (tx.type === TransactionType.DEPOSIT ||
          tx.type === TransactionType.REFUND ||
          tx.type === TransactionType.P2P_TRANSFER)
      ) {
        totalIncome = totalIncome.plus(netAmount);
      }

      // Savings: vault contributions from this user
      if (tx.senderId === userId && tx.type === TransactionType.VAULT_CONTRIBUTION) {
        totalSaved = totalSaved.plus(amount);
      }

      // Expenses: money sent by this user (excluding vault contributions tracked as savings)
      if (
        tx.senderId === userId &&
        EXPENSE_TYPES.includes(tx.type) &&
        tx.type !== TransactionType.VAULT_CONTRIBUTION
      ) {
        totalExpenses = totalExpenses.plus(amount);

        const effectiveCategory =
          tx.category ??
          this.categorization.resolveCategory(
            tx.type,
            tx.merchantName,
            tx.category,
            tx.categorySource,
          );

        const catKey = effectiveCategory as string;
        spendingMap[catKey] = (spendingMap[catKey] ?? new Prisma.Decimal(0)).plus(amount);
      }
    }

    const totalIncomeNum = totalIncome.toNumber();
    const savingsRate =
      totalIncomeNum > 0 ? (totalSaved.toNumber() / totalIncomeNum) * 100 : 0;
    const netCashFlow = totalIncome.minus(totalExpenses);

    // Find top spending category
    let topCategory: SpendingCategory | null = null;
    let topAmount = new Prisma.Decimal(0);
    for (const [cat, amt] of Object.entries(spendingMap)) {
      if (amt.greaterThan(topAmount)) {
        topAmount = amt;
        topCategory = cat as SpendingCategory;
      }
    }

    const spendingByCategory: Record<string, number> = {};
    for (const [cat, amt] of Object.entries(spendingMap)) {
      spendingByCategory[cat] = amt.toNumber();
    }

    const snapshot = await this.prisma.analyticsSnapshot.upsert({
      where: { userId_periodStart_periodEnd: { userId, periodStart, periodEnd } },
      create: {
        userId,
        periodStart,
        periodEnd,
        totalIncome,
        totalExpenses,
        netCashFlow,
        totalSaved,
        savingsRate,
        topCategory,
        transactionCount,
        spendingByCategory,
      },
      update: {
        totalIncome,
        totalExpenses,
        netCashFlow,
        totalSaved,
        savingsRate,
        topCategory,
        transactionCount,
        spendingByCategory,
      },
    });

    this.logger.debug(`Snapshot upserted for user ${userId} [${periodStart.toISOString()} – ${periodEnd.toISOString()}]`);
    return snapshot;
  }

  async getOrComputeSnapshot(userId: string, periodStart: Date, periodEnd: Date) {
    const existing = await this.prisma.analyticsSnapshot.findUnique({
      where: { userId_periodStart_periodEnd: { userId, periodStart, periodEnd } },
    });
    if (existing) return existing;
    return this.computeAndUpsertSnapshot(userId, periodStart, periodEnd);
  }

  buildMonthSummary(
    snapshot: {
      periodStart: Date;
      periodEnd: Date;
      totalIncome: Prisma.Decimal;
      totalExpenses: Prisma.Decimal;
      netCashFlow: Prisma.Decimal;
      totalSaved: Prisma.Decimal;
      savingsRate: number;
      transactionCount: number;
      topCategory: SpendingCategory | null;
      spendingByCategory: unknown;
      comparedToPrevious?: unknown;
    },
    prevSnapshot?: {
      spendingByCategory: unknown;
    } | null,
  ): MonthSummaryDto {
    const spendingByCategory = (snapshot.spendingByCategory as Record<string, number>) ?? {};
    const prevSpending = (prevSnapshot?.spendingByCategory as Record<string, number>) ?? {};
    const totalExpensesNum = snapshot.totalExpenses.toNumber();

    const breakdown: CategoryBreakdownDto[] = Object.entries(spendingByCategory)
      .sort(([, a], [, b]) => b - a)
      .map(([category, amount]) => {
        const percentage = totalExpensesNum > 0 ? (amount / totalExpensesNum) * 100 : 0;
        const prevAmount = prevSpending[category] ?? 0;
        const changeVsPrevious =
          prevAmount > 0 ? ((amount - prevAmount) / prevAmount) * 100 : null;
        return { category, amount, percentage: +percentage.toFixed(1), changeVsPrevious };
      });

    return {
      periodStart: snapshot.periodStart.toISOString(),
      periodEnd: snapshot.periodEnd.toISOString(),
      totalIncome: snapshot.totalIncome.toNumber(),
      totalExpenses: totalExpensesNum,
      netCashFlow: snapshot.netCashFlow.toNumber(),
      totalSaved: snapshot.totalSaved.toNumber(),
      savingsRate: +snapshot.savingsRate.toFixed(2),
      transactionCount: snapshot.transactionCount,
      topCategory: snapshot.topCategory,
      spendingByCategory: breakdown,
    };
  }

  currentMonthBounds(): { start: Date; end: Date } {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    return { start, end };
  }

  lastMonthBounds(): { start: Date; end: Date } {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const end = new Date(now.getFullYear(), now.getMonth(), 1);
    return { start, end };
  }
}
