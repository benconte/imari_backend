import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { Currency } from '@prisma/client';

export class InitializePaymentDto {
  @ApiProperty({
    example: 1000,
    description: 'Amount to deposit in the wallet (minimum 100 RWF or currency equivalent)',
  })
  @IsNumber()
  @Min(100, { message: 'Minimum deposit amount is 100' })
  @Type(() => Number)
  amount: number;

  @ApiPropertyOptional({
    example: 'user@example.com',
    description: 'Customer email for Flutterwave checkout. Defaults to authenticated user email.',
  })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({
    example: 'John Doe',
    description: 'Customer display name for Flutterwave checkout. Defaults to authenticated user full name.',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @ApiPropertyOptional({
    example: '+250788888888',
    description: 'Phone number for mobile money payments (MTN MoMo, Airtel Money). Include country code.',
  })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({
    enum: Currency,
    default: Currency.RWF,
    description: 'Payment currency. RWF enables mobile money (MTN/Airtel) + card. Others use card only.',
  })
  @IsOptional()
  @IsEnum(Currency)
  currency?: Currency;

  @ApiPropertyOptional({
    example: 'https://yourapp.com/payment/callback',
    description: 'URL to redirect the user after completing payment on Flutterwave checkout page.',
  })
  @IsOptional()
  @IsUrl({}, { message: 'redirectUrl must be a valid URL' })
  redirectUrl?: string;

  @ApiPropertyOptional({
    description: 'Specific wallet ID to fund. If omitted, the user primary RWF wallet is used.',
  })
  @IsOptional()
  @IsString()
  walletId?: string;
}
