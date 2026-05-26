import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, PrismaClient, Currency, TransactionType, TransactionStatus, TransactionDirection, LedgerEntryType, WalletStatus, AuditAction } from '@prisma/client';
import { randomUUID, createHash } from 'crypto';
import { PrismaService } from '@common/prisma/prisma.service';
import { hashSecret, verifySecret } from '@common/utils/hash.util';
import { generateTransactionRef, generateWalletNumber } from '@common/utils/reference.util';
import { toDecimalString } from '@common/utils/money.util';
import { KYCTier } from '@prisma/client';

const DEFAULT_DAILY_LIMIT = '500000';
const DEFAULT_MONTHLY_LIMIT = '5000000';

// KYC Tier based currency restrictions (professional fintech control)
const ALLOWED_CURRENCIES_BY_TIER: Record<KYCTier, Currency[]> = {
  TIER_0: [Currency.RWF],
  TIER_1: [Currency.RWF],
  TIER_2: [Currency.RWF, Currency.USD, Currency.EUR, Currency.KES],
  TIER_3: [Currency.RWF, Currency.USD, Currency.EUR, Currency.KES, Currency.UGX, Currency.TZS],
};

@Injectable()
export class WalletService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Automatically creates the user's first (primary) RWF wallet after email verification.
   * Uses the new unique constraint to safely handle creation.
   */
  async ensurePrimaryWallet(userId: string) {
    // Check if user already has any wallet (primary or not)
    const existing = await this.prisma.wallet.findFirst({
      where: { userId },
    });

    if (existing) return existing;

    const wallet = await this.prisma.wallet.create({
      data: {
        userId,
        currency: Currency.RWF,
        walletNumber: generateWalletNumber(),
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
        metadata: { reason: 'auto_on_activation' },
      },
    });

    return {
      ...wallet,
      balance: toDecimalString(wallet.balance),
      availableBalance: toDecimalString(wallet.availableBalance),
      dailyLimit: toDecimalString(wallet.dailyLimit),
      monthlyLimit: toDecimalString(wallet.monthlyLimit),
    };
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

  /**
   * Manually create an additional wallet for a different currency.
   * Enforces: one wallet per currency per user.
   */
  async createWallet(userId: string, currency: Currency) {
    // Get user's KYC tier for currency restriction
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { kycTier: true },
    });

    if (!user) throw new NotFoundException('User not found');

    const allowedCurrencies = ALLOWED_CURRENCIES_BY_TIER[user.kycTier] || [Currency.RWF];

    if (!allowedCurrencies.includes(currency)) {
      throw new BadRequestException(
        `Your current KYC tier (${user.kycTier}) does not allow creating a ${currency} wallet. ` +
        `Allowed currencies: ${allowedCurrencies.join(', ')}`,
      );
    }

    // Check if user already has a wallet in this currency (enforced by DB unique too)
    const existing = await this.prisma.wallet.findFirst({
      where: { userId, currency },
    });

    if (existing) {
      throw new ConflictException(`You already have a ${currency} wallet`);
    }

    const wallet = await this.prisma.wallet.create({
      data: {
        userId,
        currency,
        walletNumber: generateWalletNumber(),
        isPrimary: false,
        dailyLimit: new Prisma.Decimal(DEFAULT_DAILY_LIMIT),
        monthlyLimit: new Prisma.Decimal(DEFAULT_MONTHLY_LIMIT),
      },
    });

    await this.prisma.auditLog.create({
      data: {
        userId,
        action: AuditAction.WALLET_CREATED,
        resource: `wallet:${wallet.id}`,
        metadata: { currency, kycTier: user.kycTier },
      },
    });

    return {
      ...wallet,
      balance: toDecimalString(wallet.balance),
      availableBalance: toDecimalString(wallet.availableBalance),
      dailyLimit: toDecimalString(wallet.dailyLimit),
      monthlyLimit: toDecimalString(wallet.monthlyLimit),
    };
  }

  /**
   * Set a specific wallet as the user's primary wallet.
   * Only one wallet can be primary at any time.
   */
  async setPrimaryWallet(userId: string, walletId: string) {
    const wallet = await this.prisma.wallet.findFirst({
      where: { id: walletId, userId },
    });

    if (!wallet) {
      throw new NotFoundException('Wallet not found or does not belong to you');
    }

    if (wallet.isPrimary) {
      return { message: 'This wallet is already your primary wallet' };
    }

    if (wallet.status !== WalletStatus.ACTIVE) {
      throw new BadRequestException('Cannot set an inactive wallet as primary');
    }

    // Transaction to ensure only one primary
    await this.prisma.runInTransaction(async (tx) => {
      // Remove primary from all user's wallets
      await tx.wallet.updateMany({
        where: { userId },
        data: { isPrimary: false },
      });

      // Set the chosen one as primary
      await tx.wallet.update({
        where: { id: walletId },
        data: { isPrimary: true },
      });
    });

    await this.prisma.auditLog.create({
      data: {
        userId,
        action: AuditAction.PIN_CHANGE, // TODO: better to add WALLET_PRIMARY_CHANGED
        resource: `wallet:${walletId}`,
        metadata: { previousPrimary: 'updated', newPrimary: walletId },
      },
    });

    return { message: 'Primary wallet updated successfully' };
  }

  async getWalletById(userId: string, walletId: string) {
    const wallet = await this.prisma.wallet.findFirst({
      where: { id: walletId, userId },
    });
    if (!wallet) throw new NotFoundException('Wallet not found');
    return wallet;
  }

  // Initiate deposit: create PENDING transaction and ledger entries; provider callback will finalize
  async initiateDeposit(userId: string, walletId: string, dto: any) {
    const wallet = await this.getWalletById(userId, walletId);

    const amount = new Prisma.Decimal(dto.amount);
    if (amount.lte(0)) throw new BadRequestException('Amount must be positive');

    if (wallet.currency !== dto.currency) throw new BadRequestException('Currency mismatch');

    // Generate server-side idempotency key if not provided
    const idempotencyKey = dto.idempotencyKey ?? randomUUID();

    // Compute request hash (canonicalize important fields)
    const hash = createHash('sha256')
      .update(JSON.stringify({ userId, walletId, amount: amount.toString(), currency: dto.currency }))
      .digest('hex');

    // Check existing idempotency record for this key
    const existingKey = await this.prisma.idempotencyKey.findUnique({ where: { key: idempotencyKey } });
    if (existingKey) {
      // If same user and same requestHash, return stored response if present
      if (existingKey.userId === userId && existingKey.requestHash === hash && existingKey.responseBody) {
        return existingKey.responseBody;
      }
      throw new ConflictException('Idempotency key already used with different request');
    }

    const result = await this.prisma.runInTransaction(async (tx) => {
      // Create idempotency record upfront (reserve key)
      await tx.idempotencyKey.create({
        data: {
          key: idempotencyKey,
          userId,
          endpoint: 'POST /wallet/:id/deposit',
          requestHash: hash,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      });

      const transaction = await tx.transaction.create({
        data: {
          reference: generateTransactionRef(),
          idempotencyKey,
          receiverId: userId,
          receiverWalletId: wallet.id,
          type: TransactionType.DEPOSIT,
          direction: TransactionDirection.CREDIT,
          amount,
          currency: dto.currency,
          fee: new Prisma.Decimal(0),
          netAmount: amount,
          status: TransactionStatus.PENDING,
          description: 'Deposit initiated',
        },
      });

      // Ledger: credit system suspense (provider in-transit) and create a corresponding external provider entry
      await tx.ledgerEntry.createMany({
        data: [
          {
            transactionId: transaction.id,
            entryType: LedgerEntryType.SYSTEM_SUSPENSE,
            accountKey: 'system:suspense:provider',
            direction: TransactionDirection.CREDIT,
            amount,
            currency: dto.currency,
            balanceBefore: null,
            balanceAfter: null,
            description: 'Incoming deposit pending provider settlement',
          },
          {
            transactionId: transaction.id,
            entryType: LedgerEntryType.EXTERNAL_PROVIDER,
            accountKey: `provider:${dto.providerReference ?? 'unknown'}`,
            direction: TransactionDirection.DEBIT,
            amount,
            currency: dto.currency,
            balanceBefore: null,
            balanceAfter: null,
            description: 'Provider liability for incoming deposit',
          },
        ],
      });

      // Return response object that includes the generated idempotency key
      const response = { transactionId: transaction.id, reference: transaction.reference, idempotencyKey };

      // Store response in idempotency record
      await tx.idempotencyKey.update({ where: { key: idempotencyKey }, data: { responseStatus: 202, responseBody: response } });

      return response;
    });

    await this.prisma.auditLog.create({ data: { userId, action: AuditAction.PROFILE_UPDATE, resource: `transaction:${result.transactionId}`, metadata: { type: 'DEPOSIT', amount: dto.amount } } });

    return result;
  }

  // Initiate withdraw: verify PIN, limits, create PENDING transaction and ledger holds
  async initiateWithdraw(userId: string, walletId: string, dto: any) {
    // Verify PIN
    const pinRecord = await this.prisma.walletPin.findUnique({ where: { userId } });
    if (!pinRecord) throw new ForbiddenException('Wallet PIN not set');
    const pinValid = await verifySecret(pinRecord.pinHash, dto.pin);
    if (!pinValid) {
      await this.handleFailedPinAttempt(userId, pinRecord);
      throw new ForbiddenException('Invalid wallet PIN');
    }

    const wallet = await this.getWalletById(userId, walletId);
    const amount = new Prisma.Decimal(dto.amount);
    if (amount.lte(0)) throw new BadRequestException('Amount must be positive');
    if (wallet.currency !== dto.currency) throw new BadRequestException('Currency mismatch');
    if (wallet.isLocked) throw new ForbiddenException('Wallet is locked');

    // Check available balance
    if (wallet.availableBalance.lt(amount)) throw new BadRequestException('Insufficient available balance');

    // Generate server-side idempotency key if not provided
    const idempotencyKey = dto.idempotencyKey ?? randomUUID();

    const hash = createHash('sha256')
      .update(JSON.stringify({ userId, walletId, amount: amount.toString(), currency: dto.currency }))
      .digest('hex');

    const existingKey = await this.prisma.idempotencyKey.findUnique({ where: { key: idempotencyKey } });
    if (existingKey) {
      if (existingKey.userId === userId && existingKey.requestHash === hash && existingKey.responseBody) {
        return existingKey.responseBody;
      }
      throw new ConflictException('Idempotency key already used with different request');
    }

    const result = await this.prisma.runInTransaction(async (tx) => {
      await tx.idempotencyKey.create({
        data: {
          key: idempotencyKey,
          userId,
          endpoint: 'POST /wallet/:id/withdraw',
          requestHash: hash,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      });

      const transaction = await tx.transaction.create({
        data: {
          reference: generateTransactionRef(),
          idempotencyKey,
          senderId: userId,
          senderWalletId: wallet.id,
          type: TransactionType.WITHDRAWAL,
          direction: TransactionDirection.DEBIT,
          amount,
          currency: dto.currency,
          fee: new Prisma.Decimal(0),
          netAmount: amount,
          status: TransactionStatus.PENDING,
          description: dto.description ?? 'Withdrawal initiated',
        },
      });

      // Ledger: debit user wallet (hold) and credit system suspense
      await tx.ledgerEntry.createMany({
        data: [
          {
            transactionId: transaction.id,
            entryType: LedgerEntryType.USER_WALLET,
            walletId: wallet.id,
            accountKey: `user:wallet:${wallet.id}`,
            direction: TransactionDirection.DEBIT,
            amount,
            currency: dto.currency,
            balanceBefore: wallet.balance,
            balanceAfter: wallet.balance.sub(amount),
            description: 'Withdrawal hold - pending provider payout',
          },
          {
            transactionId: transaction.id,
            entryType: LedgerEntryType.SYSTEM_SUSPENSE,
            accountKey: 'system:suspense:provider',
            direction: TransactionDirection.CREDIT,
            amount,
            currency: dto.currency,
            balanceBefore: null,
            balanceAfter: null,
            description: 'Funds reserved for withdrawal',
          },
        ],
      });

      // Update wallet availableBalance to reflect hold
      await tx.wallet.update({ where: { id: wallet.id }, data: { availableBalance: wallet.availableBalance.sub(amount) } });

      const response = { transactionId: transaction.id, reference: transaction.reference, idempotencyKey };
      await tx.idempotencyKey.update({ where: { key: idempotencyKey }, data: { responseStatus: 202, responseBody: response } });

      return response;
    });

    await this.prisma.auditLog.create({ data: { userId, action: AuditAction.PROFILE_UPDATE, resource: `transaction:${result.transactionId}`, metadata: { type: 'WITHDRAWAL', amount: dto.amount } } });

    return result;
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

  async lookupRecipient(requestingUserId: string, walletNumber: string) {
    const wallet = await this.prisma.wallet.findUnique({ where: { walletNumber }, include: { user: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } } } });
    if (!wallet) throw new NotFoundException('Recipient not found');
    if (wallet.status !== WalletStatus.ACTIVE || wallet.isLocked) throw new BadRequestException('Recipient wallet is not active');

    const u = (wallet as any).user;
    const displayName = u ? `${u.firstName} ${u.lastName}` : null;
    const maskEmail = (e: string | null) => {
      if (!e) return null;
      const parts = e.split('@');
      if (parts[0].length <= 2) return parts[0][0] + '***@' + parts[1];
      return parts[0][0] + '***' + parts[0].slice(-1) + '@' + parts[1];
    };
    const maskPhone = (p: string | null) => {
      if (!p) return null;
      return p.replace(/.(?=.{4})/g, '*');
    };

    const maskedEmail = maskEmail(u?.email ?? null);
    const maskedPhone = maskPhone(u?.phone ?? null);
    const fingerprint = createHash('sha256').update(`${wallet.id}:${u?.id ?? ''}:${wallet.walletNumber}`).digest('hex');

    return {
      walletId: wallet.id,
      walletNumber: wallet.walletNumber,
      currency: wallet.currency,
      displayName,
      maskedEmail,
      maskedPhone,
      fingerprint,
    };
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
      recipientFingerprint?: string;
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

    // 3b. Optional recipient confirmation: if caller provided recipientFingerprint, verify it matches the lookup
    if (dto.recipientFingerprint) {
      const lookup = await this.lookupRecipient(senderUserId, dto.receiverWalletNumber);
      if (!lookup || lookup.fingerprint !== dto.recipientFingerprint) {
        throw new BadRequestException('Recipient confirmation failed. Fingerprint mismatch.');
      }
    }

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

    // 4b. Prevent mistakes: return receiver preview (name/email masked) as extra confirmation field in response when requested via lookup endpoint

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
  async completeTransaction(userId: string, transactionId: string) {
    // Only allow owners of the transaction (sender or receiver) or system roles in future
    const txRecord = await this.prisma.transaction.findUnique({ where: { id: transactionId } });
    if (!txRecord) throw new NotFoundException('Transaction not found');

    if (txRecord.status !== TransactionStatus.PENDING) {
      return { message: 'Transaction already processed', status: txRecord.status };
    }

    // Only the related user may complete (basic check)
    if (txRecord.receiverId !== userId && txRecord.senderId !== userId) {
      throw new ForbiddenException('Not authorized to complete this transaction');
    }

    // Finalize based on type
    if (txRecord.type === TransactionType.DEPOSIT) {
      // Move funds from SYSTEM_SUSPENSE -> USER_WALLET
      await this.prisma.runInTransaction(async (tx) => {
        const wallet = await tx.wallet.findUniqueOrThrow({ where: { id: txRecord.receiverWalletId! } });

        // create ledger entry crediting user wallet
        await tx.ledgerEntry.create({
          data: {
            transactionId: txRecord.id,
            entryType: LedgerEntryType.USER_WALLET,
            walletId: wallet.id,
            accountKey: `user:wallet:${wallet.id}`,
            direction: TransactionDirection.CREDIT,
            amount: txRecord.amount,
            currency: txRecord.currency,
            balanceBefore: wallet.balance,
            balanceAfter: wallet.balance.add(txRecord.amount),
            description: 'Deposit settled - credit user wallet',
          },
        });

        // Update wallet balances
        await tx.wallet.update({ where: { id: wallet.id }, data: { balance: wallet.balance.add(txRecord.amount), availableBalance: wallet.availableBalance.add(txRecord.amount) } });

        // mark transaction completed
        await tx.transaction.update({ where: { id: txRecord.id }, data: { status: TransactionStatus.COMPLETED, processedAt: new Date() } });
      });

      await this.prisma.auditLog.create({ data: { userId, action: AuditAction.PROFILE_UPDATE, resource: `transaction:${txRecord.id}`, metadata: { type: 'DEPOSIT', amount: txRecord.amount.toString() } } });

      return { message: 'Deposit completed', transactionId: txRecord.id };
    }

    if (txRecord.type === TransactionType.WITHDRAWAL) {
      // Simulate provider payout success: finalize transaction and remove suspense
      await this.prisma.runInTransaction(async (tx) => {
        const wallet = await tx.wallet.findUniqueOrThrow({ where: { id: txRecord.senderWalletId! } });

        // create ledger entry to record external provider payout debit (already had hold entry earlier)
        await tx.ledgerEntry.create({
          data: {
            transactionId: txRecord.id,
            entryType: LedgerEntryType.EXTERNAL_PROVIDER,
            accountKey: 'provider:manual-payout',
            direction: TransactionDirection.DEBIT,
            amount: txRecord.amount,
            currency: txRecord.currency,
            description: 'Provider payout completed',
          },
        });

        // mark transaction completed
        await tx.transaction.update({ where: { id: txRecord.id }, data: { status: TransactionStatus.COMPLETED, processedAt: new Date() } });
      });

      await this.prisma.auditLog.create({ data: { userId, action: AuditAction.PROFILE_UPDATE, resource: `transaction:${txRecord.id}`, metadata: { type: 'WITHDRAWAL', amount: txRecord.amount.toString() } } });

      return { message: 'Withdrawal completed', transactionId: txRecord.id };
    }

    throw new BadRequestException('Unsupported transaction type for manual completion');
  }

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
