import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { VirtualCardStatus, VirtualCardType } from '@prisma/client';

export class AdminCardQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsIn(Object.values(VirtualCardStatus))
  status?: VirtualCardStatus;

  @IsOptional()
  @IsIn(Object.values(VirtualCardType))
  type?: VirtualCardType;

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
