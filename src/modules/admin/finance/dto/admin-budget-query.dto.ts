import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { BudgetStatus, SpendingCategory } from '@prisma/client';

export class AdminBudgetQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsIn(Object.values(BudgetStatus))
  status?: BudgetStatus;

  @IsOptional()
  @IsIn(Object.values(SpendingCategory))
  category?: SpendingCategory;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number = 0;
}
