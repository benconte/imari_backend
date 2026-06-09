import { IsString, MaxLength, MinLength } from 'class-validator';

export class AdminKycRejectDto {
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  rejectionReason: string;
}
