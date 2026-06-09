import { IsNumber, IsString, IsOptional, MaxLength, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class AdminFlagTransactionDto {
  @IsString()
  @MaxLength(500)
  reason: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  riskScore?: number;
}
