import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, PrismaClient, Currency, TransactionType, TransactionStatus, TransactionDirection, LedgerEntryType, WalletStatus, AuditAction } from '@prisma/client';
import { PrismaService } from '@common/prisma/prisma.service';
import { hashSecret, verifySecret } from '@common/utils/hash.util';
import { generateTransactionRef, generateWalletNumber } from '@common/utils/reference.util';
import { toDecimalString } from '@common/utils/money.util';

const DEFAULT_DAILY_LIMIT = '500000';
const DEFAULT_MONTHLY_LIMIT = '5000000';

@Injectable()
export class WalletService {
  constructor(private readonly prisma: PrismaService) {}

  async ensurePrimaryWallet(userId: string) {
    const existing = await this.prisma.wallet.findFirst({
      where: { userId, isPrimary: true },
    });

    if (existing) return existing;

    const walletNumber = generateWalletNumber();

    const wallet = await this.prisma.wallet.create({
      data: {
        userId,
        walletNumber,
        currency: Currency.RWF, 
        isPrimary: true,
        dailyLimit: new Prisma.Decimal(DEFAULT_DAILY_LIMIT),
        monthlyLimit: new Prisma.Decimal(DEFAULT_MONTHLY_LIMIT),
      },
    });

    await this.prisma.auditLog.create({
      data: {
        userId,
        action: AuditAction.WALLET_CREATED,
        resource: `wallet:${wallet.id}`,
      },
    });

    return wallet;
  }

  async getUserWallets(userId: string) {
    const wallets = await this.prisma.wallet.findMany({
      where: { userId },
      select: {
        id: true,
        walletNumber: true,
        currency: true,
        balance: true,
        availableBalance: true,
        isPrimary: true,
        status: true,
        isLocked: true,
        dailyLimit: true,
        monthlyLimit: true,
        createdAt: true,
      },
      orderBy: { isPrimary: 'desc' },
    });

    // Convert Prisma Decimal objects to clean strings (prevents ugly {s,e,d} in JSON)
    return wallets.map((w) => ({
      ...w,
      balance: toDecimalString(w.balance),
      availableBalance: toDecimalString(w.availableBalance),
      dailyLimit: toDecimalString(w.dailyLimit),
      monthlyLimit: toDecimalString(w.monthlyLimit),
    }));
  }

  async getWalletById(userId: string, walletId: string) {
    const wallet = await this.prisma.wallet.findFirst({
      where: { id: walletId, userId },
    });
    if (!wallet) throw new NotFoundException('Wallet not found');
    return wallet;
  }

 
  async setPin(userId: string, plainPin: string) {
    const existing = await this.prisma.walletPin.findUnique({ where: { userId } });
    if (existing) {
      throw new ConflictException('Wallet PIN already set. Use change PIN endpoint.');
    }

    const pinHash = await hashSecret(plainPin);

    const pin = await this.prisma.walletPin.create({
      data: { userId, pinHash },
    });

    await this.prisma.auditLog.create({
      data: { userId, action: AuditAction.PIN_CHANGE, resource: 'wallet:pin:set' },
    });

    return { message: 'Wallet PIN set successfully' };
  }

  async changePin(userId: string, oldPin: string, newPin: string) {
    const pinRecord = await this.prisma.walletPin.findUnique({ where: { userId } });
    if (!pinRecord) throw new NotFoundException('No wallet PIN set');

    if (pinRecord.lockedUntil && pinRecord.lockedUntil > new Date()) {
      throw new ForbiddenException('PIN is temporarily locked due to failed attempts');
    }

    const isValid = await verifySecret(pinRecord.pinHash, oldPin);
    if (!isValid) {
      const updated = await this.prisma.walletPin.update({
        where: { userId },
        data: {
          failedAttempts: { increment: 1 },
          lockedUntil: pinRecord.failedAttempts + 1 >= 5 ? new Date(Date.now() + 15 * 60 * 1000) : null,
        },
      });
      if (updated.failedAttempts >= 5) {
        throw new ForbiddenException('Too many failed attempts. PIN locked for 15 minutes.');
      }
      throw new ForbiddenException('Invalid current PIN');
    }

    const newPinHash = await hashSecret(newPin);

    await this.prisma.walletPin.update({
      where: { userId },
      data: {
        pinHash: newPinHash,
        failedAttempts: 0,
        lockedUntil: null,
        lastChangedAt: new Date(),
      },
    });

    await this.prisma.auditLog.create({
      data: { userId, action: AuditAction.PIN_CHANGE, resource: 'wallet:pin:changed' },
    });

    return { message: 'Wallet PIN changed successfully' };
  }

  async p2pTransfer(
    senderUserId: string,
    dto: {
      receiverWalletNumber: string;
      amount: string;
      currency: Currency;
      description?: string;
      idempotencyKey?: string;
      pin: string;
    },
  ) {
 
    if (dto.idempotencyKey) {
      const existing = await this.prisma.idempotencyKey.findUnique({
        where: { key: dto.idempotencyKey },
      });
      if (existing && existing.userId === senderUserId) {
        if (existing.responseStatus === 200) {
          return existing.responseBody;
        }
        throw new ConflictException('Idempotency key already used with different result');
      }
    }

    // 2. Validate sender has PIN and verify it
    const pinRecord = await this.prisma.walletPin.findUnique({ where: { userId: senderUserId } });
    if (!pinRecord) {
      throw new ForbiddenException('Wallet PIN not set. Please set your PIN first.');
    }

    if (pinRecord.lockedUntil && pinRecord.lockedUntil > new Date()) {
      throw new ForbiddenException('PIN locked due to failed attempts');
    }

    const pinValid = await verifySecret(pinRecord.pinHash, dto.pin);
    if (!pinValid) {
      await this.handleFailedPinAttempt(senderUserId, pinRecord);
      throw new ForbiddenException('Invalid wallet PIN');
    }

    // 3. Find sender primary wallet
    const senderWallet = await this.prisma.wallet.findFirst({
      where: { userId: senderUserId, isPrimary: true, status: WalletStatus.ACTIVE },
    });
    if (!senderWallet) throw new NotFoundException('Sender primary wallet not found or inactive');

    if (senderWallet.isLocked) throw new ForbiddenException('Wallet is locked');

    const amount = new Prisma.Decimal(dto.amount);
    if (amount.lte(0)) throw new BadRequestException('Amount must be positive');

    if (senderWallet.currency !== dto.currency) {
      throw new BadRequestException('Cross-currency transfers not supported yet');
    }

    // 4. Find receiver wallet
    const receiverWallet = await this.prisma.wallet.findUnique({
      where: { walletNumber: dto.receiverWalletNumber },
    });
    if (!receiverWallet) throw new NotFoundException('Receiver wallet not found');
    if (receiverWallet.status !== WalletStatus.ACTIVE || receiverWallet.isLocked) {
      throw new BadRequestException('Receiver wallet is not active');
    }
    if (receiverWallet.id === senderWallet.id) {
      throw new BadRequestException('Cannot transfer to your own wallet');
    }

    // 5. Check limits (simple daily for MVP - can be enhanced with aggregates)
    if (senderWallet.dailyLimit && amount.gt(senderWallet.dailyLimit)) {
      throw new BadRequestException('Amount exceeds daily limit');
    }

    // 6. Execute atomic transfer with double-entry bookkeeping
    const result = await this.prisma.runInTransaction(async (tx) => {
      // Re-fetch inside transaction for freshness (serializable isolation protects us)
      const freshSender = await tx.wallet.findUniqueOrThrow({
        where: { id: senderWallet.id },
      });
      const freshReceiver = await tx.wallet.findUniqueOrThrow({
        where: { id: receiverWallet.id },
      });

      const senderAvailable = freshSender.availableBalance;
      if (senderAvailable.lt(amount)) {
        throw new BadRequestException('Insufficient available balance');
      }

      const newSenderBalance = freshSender.balance.sub(amount);
      const newSenderAvailable = freshSender.availableBalance.sub(amount);
      const newReceiverBalance = freshReceiver.balance.add(amount);
      const newReceiverAvailable = freshReceiver.availableBalance.add(amount);

      // Create Transaction record
      const transaction = await tx.transaction.create({
        data: {
          reference: generateTransactionRef(),
          senderId: senderUserId,
          receiverId: receiverWallet.userId,
          senderWalletId: senderWallet.id,
          receiverWalletId: receiverWallet.id,
          type: TransactionType.P2P_TRANSFER,
          direction: TransactionDirection.DEBIT, // from sender perspective
          amount,
          currency: dto.currency,
          fee: new Prisma.Decimal(0),
          netAmount: amount,
          status: TransactionStatus.COMPLETED,
          description: dto.description ?? 'P2P transfer',
          processedAt: new Date(),
        },
      });

      // Double-entry ledger (critical for audit & reconciliation)
      await tx.ledgerEntry.createMany({
        data: [
          {
            transactionId: transaction.id,
            entryType: LedgerEntryType.USER_WALLET,
            walletId: senderWallet.id,
            accountKey: `user:wallet:${senderWallet.id}`,
            direction: TransactionDirection.DEBIT,
            amount,
            currency: dto.currency,
            balanceBefore: freshSender.balance,
            balanceAfter: newSenderBalance,
            description: 'P2P transfer out',
          },
          {
            transactionId: transaction.id,
            entryType: LedgerEntryType.USER_WALLET,
            walletId: receiverWallet.id,
            accountKey: `user:wallet:${receiverWallet.id}`,
            direction: TransactionDirection.CREDIT,
            amount,
            currency: dto.currency,
            balanceBefore: freshReceiver.balance,
            balanceAfter: newReceiverBalance,
            description: 'P2P transfer in',
          },
        ],
      });

      // Update balances
      await tx.wallet.update({
        where: { id: senderWallet.id },
        data: {
          balance: newSenderBalance,
          availableBalance: newSenderAvailable,
        },
      });

      await tx.wallet.update({
        where: { id: receiverWallet.id },
        data: {
          balance: newReceiverBalance,
          availableBalance: newReceiverAvailable,
        },
      });

      // Reset failed PIN attempts on successful high-value action
      await tx.walletPin.update({
        where: { userId: senderUserId },
        data: { failedAttempts: 0, lockedUntil: null },
      });

      return {
        transactionId: transaction.id,
        reference: transaction.reference,
        amount: amount.toString(),
        currency: dto.currency,
        senderWalletNumber: senderWallet.walletNumber,
        receiverWalletNumber: receiverWallet.walletNumber,
        status: TransactionStatus.COMPLETED,
        processedAt: transaction.processedAt,
      };
    });

    // Store idempotency response if key provided
    if (dto.idempotencyKey) {
      await this.prisma.idempotencyKey.create({
        data: {
          key: dto.idempotencyKey,
          userId: senderUserId,
          endpoint: 'POST /wallet/transfer',
          requestHash: '', // could hash dto for extra safety
          responseStatus: 200,
          responseBody: result as any,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      });
    }

   
    await this.prisma.auditLog.create({
      data: {
        userId: senderUserId,
        action: AuditAction.PROFILE_UPDATE, // TODO: add dedicated TRANSFER action to enum later
        resource: `transaction:${result.transactionId}`,
        metadata: { type: 'P2P_TRANSFER', amount: dto.amount },
      },
    });

    return result;
  }

  private async handleFailedPinAttempt(userId: string, currentPin: any) {
    const newAttempts = currentPin.failedAttempts + 1;
    const lockUntil = newAttempts >= 5 ? new Date(Date.now() + 15 * 60 * 1000) : null;

    await this.prisma.walletPin.update({
      where: { userId },
      data: {
        failedAttempts: newAttempts,
        lockedUntil: lockUntil,
      },
    });

    if (lockUntil) {
      await this.prisma.auditLog.create({
        data: {
          userId,
          action: AuditAction.SUSPICIOUS_ACTIVITY,
          metadata: { reason: 'wallet_pin_lockout' },
        },
      });
    }
  }

  /**
   * Get paginated transaction history for user's wallets.
   */
  async getTransactionHistory(userId: string, query: any) {
    const where: any = {
      OR: [
        { senderId: userId },
        { receiverId: userId },
      ],
    };

    if (query.walletId) {
      where.OR = [
        { senderWalletId: query.walletId },
        { receiverWalletId: query.walletId },
      ];
    }

    if (query.type) {
      where.type = query.type;
    }

    if (query.status) {
      where.status = query.status;
    }

    if (query.fromDate || query.toDate) {
      where.createdAt = {};
      if (query.fromDate) where.createdAt.gte = new Date(query.fromDate);
      if (query.toDate) where.createdAt.lte = new Date(query.toDate);
    }

    const transactions = await this.prisma.transaction.findMany({
      where,
      take: query.limit ?? 20,
      orderBy: { createdAt: 'desc' },
      include: {
        senderWallet: { select: { walletNumber: true } },
        receiverWallet: { select: { walletNumber: true } },
      },
    });

    return transactions;
  }
}
