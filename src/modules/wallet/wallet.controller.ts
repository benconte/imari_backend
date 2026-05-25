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
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '@common/decorators/public.decorator';
import { ZodValidationPipe } from '@common/pipes/zod-validation.pipe';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { AuthUser } from '@modules/auth/strategies/jwt.strategy';
import { WalletService } from './wallet.service';
import {
  ChangePinDto,
  ChangePinDtoSwagger,
  ChangePinSchema,
  P2PTransferDto,
  P2PTransferDtoSwagger,
  P2PTransferSchema,
  SetPinDto,
  SetPinDtoSwagger,
  SetPinSchema,
  TransactionHistoryQuery,
  TransactionHistoryQuerySchema,
} from './dto/wallet.dto';

@ApiTags('wallet')
@ApiBearerAuth()                    // ← This makes the lock icon appear
@Controller('wallet')
@UseGuards(JwtAuthGuard)
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  @Get('me')
  @ApiOperation({ summary: 'Get all wallets for the current user' })
  @ApiResponse({ status: 200, description: 'List of wallets with balances' })
  async getMyWallets(@CurrentUser() user: AuthUser) {
    return this.walletService.getUserWallets(user.userId);
  }

  @Post('pin')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Set initial 4-digit wallet PIN (one time only)' })
  @ApiBody({
    type: SetPinDtoSwagger,
    examples: {
      valid: {
        summary: 'Set wallet PIN',
        value: { pin: '1234' },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'PIN set successfully' })
  async setPin(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(SetPinSchema)) dto: SetPinDto,
  ) {
    return this.walletService.setPin(user.userId, dto.pin);
  }

  @Put('pin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Change existing wallet PIN (requires old PIN)' })
  @ApiBody({
    type: ChangePinDtoSwagger,
    examples: {
      valid: {
        summary: 'Change PIN',
        value: { oldPin: '1234', newPin: '5678' },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'PIN changed successfully' })
  async changePin(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(ChangePinSchema)) dto: ChangePinDto,
  ) {
    return this.walletService.changePin(user.userId, dto.oldPin, dto.newPin);
  }

  @Post('transfer')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send money P2P to another wallet (PIN required in body)' })
  @ApiBody({
    type: P2PTransferDtoSwagger,
    examples: {
      valid: {
        summary: 'Standard P2P transfer',
        value: {
          receiverWalletNumber: 'IMR-7465291357',
          amount: '5000',
          currency: 'RWF',
          description: 'Monthly support',
          pin: '1234',
        },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Transfer successful' })
  @ApiResponse({ status: 401, description: 'Invalid PIN or wallet locked' })
  async p2pTransfer(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(P2PTransferSchema)) dto: P2PTransferDto,
  ) {
    return this.walletService.p2pTransfer(user.userId, dto);
  }

  @Get('transactions')
  @ApiOperation({ summary: 'Get paginated transaction history for your wallets' })
  @ApiResponse({ status: 200, description: 'List of transactions' })
  async getHistory(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(TransactionHistoryQuerySchema)) query: TransactionHistoryQuery,
  ) {
    return this.walletService.getTransactionHistory(user.userId, query);
  }
}
