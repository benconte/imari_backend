import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SpendingCategory } from '@prisma/client';
import { z } from 'zod';

export const RecategorizeSchema = z.object({
  category: z.nativeEnum(SpendingCategory),
});

export type RecategorizeDto = z.infer<typeof RecategorizeSchema>;

export class RecategorizeDtoSwagger {
  @ApiProperty({ enum: SpendingCategory, example: SpendingCategory.FOOD_AND_DINING })
  category!: SpendingCategory;
}

export class CategoryBreakdownDto {
  @ApiProperty({ example: 'FOOD_AND_DINING' })
  category!: string;

  @ApiProperty({ example: 12500.0 })
  amount!: number;

  @ApiProperty({ example: 18.5 })
  percentage!: number;

  @ApiPropertyOptional({ example: 15.3, description: '% change vs previous period' })
  changeVsPrevious?: number | null;
}

export class MonthSummaryDto {
  @ApiProperty({ example: '2026-06-01T00:00:00.000Z' })
  periodStart!: string;

  @ApiProperty({ example: '2026-06-30T23:59:59.999Z' })
  periodEnd!: string;

  @ApiProperty({ example: 250000 })
  totalIncome!: number;

  @ApiProperty({ example: 185000 })
  totalExpenses!: number;

  @ApiProperty({ example: 65000 })
  netCashFlow!: number;

  @ApiProperty({ example: 30000 })
  totalSaved!: number;

  @ApiProperty({ example: 12.0 })
  savingsRate!: number;

  @ApiProperty({ example: 42 })
  transactionCount!: number;

  @ApiPropertyOptional({ enum: SpendingCategory })
  topCategory?: SpendingCategory | null;

  @ApiProperty({ type: [CategoryBreakdownDto] })
  spendingByCategory!: CategoryBreakdownDto[];
}

export class DashboardResponseDto {
  @ApiProperty({ type: MonthSummaryDto })
  currentMonth!: MonthSummaryDto;

  @ApiPropertyOptional({ type: MonthSummaryDto })
  lastMonth?: MonthSummaryDto | null;

  @ApiProperty({ example: 72.5 })
  healthScore!: number;

  @ApiProperty({ type: [Object] })
  insights!: FinancialInsightDto[];
}

export class FinancialInsightDto {
  @ApiProperty({ example: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Food spend is up 35%' })
  title!: string;

  @ApiProperty({ example: 'Your food spending rose from RWF 8,000 to RWF 10,800 vs last month.' })
  body!: string;

  @ApiProperty({ example: 'SPENDING_PATTERN' })
  insightType!: string;

  @ApiProperty({ example: 2 })
  priority!: number;

  @ApiProperty({ example: false })
  isRead!: boolean;

  @ApiPropertyOptional({ example: '2026-07-01T00:00:00.000Z' })
  expiresAt?: string | null;
}

export class ForecastResponseDto {
  @ApiProperty({ example: 'FOOD_AND_DINING' })
  category!: string;

  @ApiProperty({ example: 15000 })
  projectedMonthlySpend!: number;

  @ApiProperty({ example: 8500 })
  spentSoFar!: number;

  @ApiProperty({ example: 6500 })
  remainingProjected!: number;
}

export class HealthScoreResponseDto {
  @ApiProperty({ example: 72.5 })
  overall!: number;

  @ApiProperty({ example: 22 })
  savingsRateScore!: number;

  @ApiProperty({ example: 18 })
  expenseVolatilityScore!: number;

  @ApiProperty({ example: 24 })
  budgetAdherenceScore!: number;

  @ApiProperty({ example: 8.5 })
  emergencyFundScore!: number;
}
