import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '@common/decorators/public.decorator';
import { ZodValidationPipe } from '@common/pipes/zod-validation.pipe';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { AuthUser } from '@modules/auth/strategies/jwt.strategy';
import { WalletService } from './wallet.service';
import {
  ChangePinDto,
  ChangePinSchema,
  P2PTransferDto,
  P2PTransferSchema,
  SetPinDto,
  SetPinSchema,
  TransactionHistoryQuery,
  TransactionHistoryQuerySchema,
} from './dto/wallet.dto';

@ApiTags('wallet')
@Controller('wallet')
@UseGuards(JwtAuthGuard)
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  @Get('me')
  async getMyWallets(@CurrentUser() user: AuthUser) {
    return this.walletService.getUserWallets(user.userId);
  }

  @Post('pin')
  @HttpCode(HttpStatus.CREATED)
  async setPin(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(SetPinSchema)) dto: SetPinDto,
  ) {
    return this.walletService.setPin(user.userId, dto.pin);
  }

  @Put('pin')
  @HttpCode(HttpStatus.OK)
  async changePin(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(ChangePinSchema)) dto: ChangePinDto,
  ) {
    return this.walletService.changePin(user.userId, dto.oldPin, dto.newPin);
  }

  @Post('transfer')
  @HttpCode(HttpStatus.OK)
  async p2pTransfer(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(P2PTransferSchema)) dto: P2PTransferDto,
  ) {
    return this.walletService.p2pTransfer(user.userId, dto);
  }

  @Get('transactions')
  async getHistory(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(TransactionHistoryQuerySchema)) query: TransactionHistoryQuery,
  ) {
    return this.walletService.getTransactionHistory(user.userId, query);
  }
}
