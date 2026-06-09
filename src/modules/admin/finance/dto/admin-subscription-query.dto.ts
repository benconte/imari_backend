import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { SubscriptionBillingCycle, SubscriptionStatus } from '@prisma/client';

export class AdminSubscriptionQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsIn(Object.values(SubscriptionStatus))
  status?: SubscriptionStatus;

  @IsOptional()
  @IsIn(Object.values(SubscriptionBillingCycle))
  billingCycle?: SubscriptionBillingCycle;

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
