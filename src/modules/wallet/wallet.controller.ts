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
import { Currency } from '@prisma/client';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { AuthUser } from '@modules/auth/strategies/jwt.strategy';
import { WalletService } from './wallet.service';
import {
  ChangePinDto,
  ChangePinDtoSwagger,
  ChangePinSchema,
  CreateWalletDto,
  CreateWalletDtoSwagger,
  CreateWalletSchema,
  P2PTransferDto,
  P2PTransferDtoSwagger,
  P2PTransferSchema,
  SetPinDto,
  SetPinDtoSwagger,
  SetPinSchema,
  SetPrimaryWalletDto,
  SetPrimaryWalletDtoSwagger,
  SetPrimaryWalletSchema,
  TransactionHistoryQuery,
  TransactionHistoryQuerySchema,
} from './dto/wallet.dto';

@ApiTags('wallet')
@ApiBearerAuth()                    
@Controller('wallet')
@UseGuards(JwtAuthGuard)
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new wallet in a different currency' })
  @ApiBody({
    type: CreateWalletDtoSwagger,
    examples: {
      usd: { summary: 'Create USD wallet', value: { currency: 'USD' } },
      eur: { summary: 'Create EUR wallet', value: { currency: 'EUR' } },
    },
  })
  @ApiResponse({ status: 201, description: 'Wallet created successfully' })
  @ApiResponse({ status: 409, description: 'You already have a wallet in this currency' })
  async createWallet(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(CreateWalletSchema)) dto: CreateWalletDto,
  ) {
    return this.walletService.createWallet(user.userId, dto.currency);
  }

  @Get('currencies')
  @ApiOperation({ summary: 'Get list of supported currencies (for dropdowns)' })
  @ApiResponse({ status: 200, description: 'List of available currencies' })
  getSupportedCurrencies() {
    // Returns all currencies from the Prisma enum
    return Object.values(Currency);
  }

  @Post('set-primary')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Set one of your wallets as the primary wallet' })
  @ApiBody({
    type: SetPrimaryWalletDtoSwagger,
    examples: {
      example: {
        summary: 'Set a wallet as primary',
        value: { walletId: '07c03b10-cde1-41d5-a2be-8ab8978b51eb' },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Primary wallet updated' })
  async setPrimaryWallet(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(SetPrimaryWalletSchema)) dto: SetPrimaryWalletDto,
  ) {
    return this.walletService.setPrimaryWallet(user.userId, dto.walletId);
  }

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
