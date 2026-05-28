import { Injectable, BadRequestException, NotFoundException, ForbiddenException, Logger } from '@nestjs/common';
import { PrismaService } from '@common/prisma/prisma.service';
import { Prisma, VirtualCard, VirtualCardStatus, VirtualCardType, TransactionType, TransactionDirection, TransactionStatus, LedgerEntryType, Currency } from '@prisma/client';
import { encrypt, decrypt } from '@common/utils/crypto.util';
import { generateReference } from '@common/utils/reference.util';
import { randomUUID, createHash } from 'crypto';

@Injectable()
export class VirtualCardService {
  private readonly logger = new Logger(VirtualCardService.name);
  constructor(private readonly prisma: PrismaService) {}

  // Helper to generate a valid card number (Luhn algorithm)
  private generateCardNumber(): string {
    // Generate 15 digits (first 15) then calculate check digit
    let nums = '';
    for (let i = 0; i < 15; i++) {
      nums += Math.floor(Math.random() * 10);
    }

    // Luhn algorithm
    let sum = 0;
    for (let i = 0; i < 15; i++) {
      let digit = parseInt(nums.charAt(i));
      if ((14 - i) % 2 === 0) { // double every other starting from right
        digit *= 2;
        if (digit > 9) digit -= 9;
      }
      sum += digit;
    }
    const checkDigit = (sum * 9) % 10;
    return nums + checkDigit;
  }

  // Helper to generate expiry date (typically 3-5 years from now)
  private generateExpiryDate(): { month: number; year: number } {
    const now = new Date();
    const year = now.getFullYear() + 3 + Math.floor(Math.random() * 3); // 3-5 years
    const month = 1 + Math.floor(Math.random() * 12);
    return { month, year };
  }

  async createVirtualCard(userId: string, dto: any) {
    // Validate wallet belongs to user
    const wallet = await this.prisma.wallet.findUnique({ where: { id: dto.walletId } });
    if (!wallet || wallet.userId !== userId) {
      throw new ForbiddenException('Wallet not found or unauthorized');
    }

    // Generate card details
    const cardNumber = this.generateCardNumber();
    const { month: expiryMonth, year: expiryYear } = this.generateExpiryDate();
    const cvv = Math.floor(100 + Math.random() * 900).toString(); // 3-digit CVV

    // Encrypt sensitive data
    const cardNumberEnc = encrypt(cardNumber);
    const cvvEnc = encrypt(cvv);

    // Masked number for display (last 4 digits)
    const maskedNumber = `**** **** **** ${cardNumber.slice(-4)}`;

    // Create virtual card record
    const virtualCard = await this.prisma.virtualCard.create({
      data: {
        userId,
        walletId: dto.walletId,
        cardNumberEnc,
        cardNumberLast4: cardNumber.slice(-4),
        maskedNumber,
        expiryMonth,
        expiryYear,
        cvvEnc,
        cvvLastRotatedAt: new Date(),
        cardHolder: `${dto.firstName ?? ''} ${dto.lastName ?? ''}`.trim() || 'IMARI USER',
        type: dto.type ?? VirtualCardType.MULTI_USE,
        status: VirtualCardStatus.ACTIVE,
        spendingLimit: dto.spendingLimit ? new Prisma.Decimal(dto.spendingLimit) : null,
        dailyLimit: dto.dailyLimit ? new Prisma.Decimal(dto.dailyLimit) : null,
        spentToday: new Prisma.Decimal(0),
        spentTotal: new Prisma.Decimal(0),
        currency: dto.currency,
        allowOnline: dto.allowOnline ?? true,
        allowInternational: dto.allowInternational ?? false,
        blockedMccs: dto.blockedMccs ?? [],
        allowedMerchants: dto.allowedMerchants ?? [],
      },
    });

    return {
      id: virtualCard.id,
      maskedNumber: virtualCard.maskedNumber,
      expiry: `${virtualCard.expiryMonth.toString().padStart(2, '0')}/${virtualCard.expiryYear
        .toString()
        .slice(-2)}`,
      type: virtualCard.type,
      status: virtualCard.status,
      spendingLimit: virtualCard.spendingLimit?.toString(),
      dailyLimit: virtualCard.dailyLimit?.toString(),
      currency: virtualCard.currency,
      allowOnline: virtualCard.allowOnline,
      allowInternational: virtualCard.allowInternational,
      blockedMccs: virtualCard.blockedMccs,
      allowedMerchants: virtualCard.allowedMerchants,
      createdAt: virtualCard.createdAt,
      updatedAt: virtualCard.updatedAt,
    };
  }

  async getUserVirtualCards(userId: string) {
    const cards = await this.prisma.virtualCard.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    return cards.map((card) => ({
      id: card.id,
      maskedNumber: card.maskedNumber,
      expiry: `${card.expiryMonth.toString().padStart(2, '0')}/${card.expiryYear
        .toString()
        .slice(-2)}`,
      type: card.type,
      status: card.status,
      spendingLimit: card.spendingLimit?.toString(),
      dailyLimit: card.dailyLimit?.toString(),
      currency: card.currency,
      allowOnline: card.allowOnline,
      allowInternational: card.allowInternational,
      blockedMccs: card.blockedMccs,
      allowedMerchants: card.allowedMerchants,
      createdAt: card.createdAt,
      updatedAt: card.updatedAt,
    }));
  }

  async getVirtualCardById(userId: string, cardId: string) {
    const card = await this.prisma.virtualCard.findUnique({
      where: { id: cardId },
    });

    if (!card || card.userId !== userId) {
      throw new NotFoundException('Virtual card not found');
    }

    return {
      id: card.id,
      maskedNumber: card.maskedNumber,
      expiry: `${card.expiryMonth.toString().padStart(2, '0')}/${card.expiryYear
        .toString()
        .slice(-2)}`,
      type: card.type,
      status: card.status,
      spendingLimit: card.spendingLimit?.toString(),
      dailyLimit: card.dailyLimit?.toString(),
      currency: card.currency,
      allowOnline: card.allowOnline,
      allowInternational: card.allowInternational,
      blockedMccs: card.blockedMccs,
      allowedMerchants: card.allowedMerchants,
      createdAt: card.createdAt,
      updatedAt: card.updatedAt,
    };
  }

  async updateVirtualCard(userId: string, cardId: string, dto: any) {
    const card = await this.getVirtualCardById(userId, cardId);

    // Only allow updating certain fields
    const updateData: any = {};
    if (dto.spendingLimit !== undefined) {
      updateData.spendingLimit = new Prisma.Decimal(dto.spendingLimit);
    }
    if (dto.dailyLimit !== undefined) {
      updateData.dailyLimit = new Prisma.Decimal(dto.dailyLimit);
    }
    if (dto.allowOnline !== undefined) {
      updateData.allowOnline = dto.allowOnline;
    }
    if (dto.allowInternational !== undefined) {
      updateData.allowInternational = dto.allowInternational;
    }
    if (dto.blockedMccs !== undefined) {
      updateData.blockedMccs = dto.blockedMccs;
    }
    if (dto.allowedMerchants !== undefined) {
      updateData.allowedMerchants = dto.allowedMerchants;
    }

    return this.prisma.virtualCard.update({
      where: { id: cardId },
      data: updateData,
    });
  }

  async freezeVirtualCard(userId: string, cardId: string) {
    const card = await this.getVirtualCardById(userId, cardId);
    return this.prisma.virtualCard.update({
      where: { id: cardId },
      data: { status: VirtualCardStatus.FROZEN },
    });
  }

  async unfreezeVirtualCard(userId: string, cardId: string) {
    const card = await this.getVirtualCardById(userId, cardId);
    return this.prisma.virtualCard.update({
      where: { id: cardId },
      data: { status: VirtualCardStatus.ACTIVE },
    });
  }

  async authorizeTransaction(userId: string, dto: any) {
    // Get the virtual card
    const card = await this.prisma.virtualCard.findUnique({
      where: { id: dto.virtualCardId },
    });

    if (!card || card.userId !== userId) {
      throw new NotFoundException('Virtual card not found');
    }

    if (card.status !== VirtualCardStatus.ACTIVE) {
      throw new BadRequestException('Virtual card is not active');
    }

    // Check limits and currency
    const amount = new Prisma.Decimal(dto.amount);
    if (card.currency !== dto.currency) {
      throw new BadRequestException('Transaction currency must match card currency');
    }
    if (card.dailyLimit && card.spentToday.add(amount).gt(card.dailyLimit)) {
      throw new BadRequestException('Daily spending limit exceeded');
    }
    if (card.spendingLimit && card.spentTotal.add(amount).gt(card.spendingLimit)) {
      throw new BadRequestException('Spending limit exceeded');
    }

    // Decrypt CVV for verification (in real scenario, CVV is not stored, but for this implementation we have it encrypted)
    // Note: In production, CVV should not be stored. This is for demonstration only.
    const cvv = decrypt(card.cvvEnc);
    // In a real authorization, you would send CVV to the payment provider, but we are simulating.

    // Generate authorization reference
    const authReference = generateReference('IMAuth');

    // Create transaction record (pending authorization)
    const transaction = await this.prisma.transaction.create({
      data: {
        reference: authReference,
        idempotencyKey: dto.idempotencyKey ?? randomUUID(),
        senderId: userId,
        senderWalletId: card.walletId,
        amount,
        currency: dto.currency,
        fee: new Prisma.Decimal(0),
        netAmount: amount,
        status: TransactionStatus.PENDING,
        type: TransactionType.CARD_PAYMENT,
        direction: TransactionDirection.DEBIT,
        description: `Card payment to ${dto.merchantName}`,
        merchantName: dto.merchantName,
        // merchantId would be set after capture from provider
      },
    });

    // Create card transaction record
    const cardTransaction = await this.prisma.cardTransaction.create({
      data: {
        cardId: card.id,
        transactionId: transaction.id,
        merchantName: dto.merchantName,
        merchantCity: dto.merchantCity,
        merchantCountry: dto.merchantCountry,
        mcc: dto.mcc,
        amount,
        currency: dto.currency,
        authStatus: 'AUTHORIZED', // CardTransactionStatus.AUTHORIZED
        authorizedAt: new Date(),
      },
    });

    // Update virtual card spent today (but not total yet - wait for capture)
    await this.prisma.virtualCard.update({
      where: { id: card.id },
      data: {
        spentToday: card.spentToday.add(amount),
      },
    });

   

    return {
      transactionId: transaction.id,
      authorizationId: cardTransaction.id,
      amount: transaction.amount.toString(),
      currency: transaction.currency,
      authStatus: cardTransaction.authStatus,
      authorizedAt: cardTransaction.authorizedAt,
    };
  }

  async captureTransaction(userId: string, dto: any) {
    // Get the card transaction
    const cardTransaction = await this.prisma.cardTransaction.findUnique({
      where: { id: dto.authorizationId },
      include: { card: true, transaction: true },
    });

    if (!cardTransaction || cardTransaction.card.userId !== userId) {
      throw new NotFoundException('Authorization not found');
    }

    if (cardTransaction.authStatus !== 'AUTHORIZED') {
      throw new BadRequestException('Transaction is not authorized');
    }

    const amountToCapture = dto.amount
      ? new Prisma.Decimal(dto.amount)
      : cardTransaction.amount;

    // Check if amount to capture is valid
    if (amountToCapture.lt(new Prisma.Decimal(0)) || amountToCapture.gt(cardTransaction.amount)) {
      throw new BadRequestException('Invalid capture amount');
    }

    // Update card transaction
    await this.prisma.cardTransaction.update({
      where: { id: dto.authorizationId },
      data: {
        authStatus: 'CAPTURED', // CardTransactionStatus.CAPTURED
        capturedAt: new Date(),
        amount: amountToCapture, // Update amount if partial capture
      },
    });

    // Update transaction
    await this.prisma.transaction.update({
      where: { id: cardTransaction.transactionId },
      data: {
        status: TransactionStatus.COMPLETED,
        processedAt: new Date(),
        amount: amountToCapture,
        netAmount: amountToCapture.sub(
          cardTransaction.transaction.fee ?? new Prisma.Decimal(0)
        ),
      },
    });

    // Update virtual card spent total (and reset spent today if needed - but we reset daily at midnight via cron)
    await this.prisma.virtualCard.update({
      where: { id: cardTransaction.cardId },
      data: {
        spentTotal: cardTransaction.card.spentTotal.add(amountToCapture),
        // Note: spentToday is already updated during authorization
      },
    });

    // Create ledger entries for the actual movement of money
    await this.prisma.$transaction(async (tx) => {
      // Debit wallet, credit external provider (or system suspense)
      await tx.ledgerEntry.createMany({
        data: [
          {
            transactionId: cardTransaction.transactionId,
            entryType: LedgerEntryType.USER_WALLET,
            walletId: cardTransaction.card.walletId,
            accountKey: `user:wallet:${cardTransaction.card.walletId}`,
            direction: TransactionDirection.DEBIT,
            amount: amountToCapture,
            currency: cardTransaction.currency,
            balanceBefore: await this.getWalletBalance(
              cardTransaction.card.walletId
            ),
            balanceAfter: (await this.getWalletBalance(
              cardTransaction.card.walletId
            )).sub(amountToCapture),
            description: `Card payment captured: ${cardTransaction.merchantName}`,
          },
          {
            transactionId: cardTransaction.transactionId,
            entryType: LedgerEntryType.EXTERNAL_PROVIDER,
            accountKey: `system:suspense:flutterwave`, // or whatever provider
            direction: TransactionDirection.CREDIT,
            amount: amountToCapture,
            currency: cardTransaction.currency,
            
            description: `Card payment to ${cardTransaction.merchantName}`,
          },
        ],
      });
    });

    return {
      transactionId: cardTransaction.transactionId,
      amount: amountToCapture.toString(),
      currency: cardTransaction.currency,
      status: 'CAPTURED',
      capturedAt: new Date(),
    };
  }

  async reverseTransaction(userId: string, dto: any) {
    const transaction = await this.prisma.transaction.findUnique({
      where: { id: dto.transactionId },
      include: { cardTransaction: { include: { card: true } } },
    });

    if (!transaction || !transaction.cardTransaction || !transaction.cardTransaction.card) {
      throw new NotFoundException('Transaction not found');
    }

    if (transaction.cardTransaction.card.userId !== userId) {
      throw new NotFoundException('Transaction not found');
    }

    if (transaction.status !== TransactionStatus.COMPLETED) {
      throw new BadRequestException('Only completed transactions can be reversed');
    }

    const amountToReverse = dto.amount
      ? new Prisma.Decimal(dto.amount)
      : transaction.amount;

    if (amountToReverse.lt(new Prisma.Decimal(0)) || amountToReverse.gt(transaction.amount)) {
      throw new BadRequestException('Invalid reversal amount');
    }

    await this.prisma.transaction.update({
      where: { id: dto.transactionId },
      data: {
        status: TransactionStatus.REVERSED,
        reversedAt: new Date(),
      },
    });

    await this.prisma.cardTransaction.update({
      where: { id: transaction.cardTransaction!.id },
      data: {
        authStatus: 'REVERSED', 
        reversedAt: new Date(),
      },
    });

    await this.prisma.virtualCard.update({
      where: { id: transaction.cardTransaction!.cardId },
      data: {
         spentTotal: (transaction.cardTransaction.card.spentTotal as any).sub(amountToReverse),
         spentToday: (transaction.cardTransaction.card.spentToday as any).sub(amountToReverse),
      },
    });

    await this.prisma.$transaction(async (tx) => {
      await tx.ledgerEntry.createMany({
        data: [
          {
            transactionId: dto.transactionId,
            entryType: LedgerEntryType.USER_WALLET,
            walletId: transaction.cardTransaction!.card.walletId,
            accountKey: `user:wallet:${transaction.cardTransaction!.card.walletId}`,
            direction: TransactionDirection.CREDIT,
            amount: amountToReverse,
            currency: transaction.currency,
            balanceBefore: await this.getWalletBalance(
              transaction.cardTransaction!.card.walletId
            ),
            balanceAfter: (await this.getWalletBalance(
              transaction.cardTransaction!.card.walletId
            )).add(amountToReverse),
            description: `Card payment reversal: ${transaction.cardTransaction!.merchantName}`,
          },
          {
            transactionId: dto.transactionId,
            entryType: LedgerEntryType.EXTERNAL_PROVIDER,
            accountKey: `system:suspense:flutterwave`,
            direction: TransactionDirection.DEBIT,
            amount: amountToReverse,
            currency: transaction.currency,
            description: `Card payment reversal to ${transaction.cardTransaction!.merchantName}`,
          },
        ],
      });
    });

    return {
      transactionId: dto.transactionId,
      amount: amountToReverse.toString(),
      currency: transaction.currency,
      status: 'REVERSED',
      reversedAt: new Date(),
    };
  }

  private async getWalletBalance(walletId: string): Promise<Prisma.Decimal> {
    const wallet = await this.prisma.wallet.findUnique({ where: { id: walletId } });
    return wallet ? wallet.balance : new Prisma.Decimal(0);
  }
}