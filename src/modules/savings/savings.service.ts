import { Injectable, BadRequestException, NotFoundException, ForbiddenException, Logger } from '@nestjs/common';
import { PrismaService } from '@common/prisma/prisma.service';
import { Prisma, TransactionType, TransactionDirection, TransactionStatus, LedgerEntryType } from '@prisma/client';
import { randomUUID, createHash } from 'crypto';

@Injectable()
export class SavingsService {
  private readonly logger = new Logger(SavingsService.name);
  constructor(private readonly prisma: PrismaService) {}

  async createVault(userId: string, dto: any) {
    // validate wallet belongs to user
    const wallet = await this.prisma.wallet.findUnique({ where: { id: dto.walletId } });
    if (!wallet || wallet.userId !== userId) throw new ForbiddenException('Wallet not found or unauthorized');

    const vault = await this.prisma.savingsVault.create({
      data: {
        userId,
        walletId: dto.walletId,
        name: dto.name,
        description: dto.description,
        targetAmount: new Prisma.Decimal(dto.targetAmount),
        currentAmount: new Prisma.Decimal(0),
        currency: dto.currency,
        status: 'ACTIVE',
        isLocked: false,
        targetDate: dto.targetDate ? new Date(dto.targetDate) : null,
        iconEmoji: dto.iconEmoji,
      },
    });

    return vault;
  }

  async getUserVaults(userId: string) {
    return this.prisma.savingsVault.findMany({ where: { userId } });
  }

  async getVault(userId: string, id: string) {
    const v = await this.prisma.savingsVault.findUnique({ where: { id } });
    if (!v || v.userId !== userId) throw new NotFoundException('Vault not found');
    return v;
  }

  async updateVault(userId: string, id: string, dto: any) {
    const v = await this.getVault(userId, id);
    return this.prisma.savingsVault.update({ where: { id }, data: dto });
  }

  async deleteVault(userId: string, id: string) {
    const v = await this.getVault(userId, id);
    return this.prisma.savingsVault.delete({ where: { id } });
  }

  async lockVault(userId: string, id: string) {
    const v = await this.getVault(userId, id);
    return this.prisma.savingsVault.update({ where: { id }, data: { isLocked: true } });
  }

  async unlockVault(userId: string, id: string) {
    const v = await this.getVault(userId, id);
    return this.prisma.savingsVault.update({ where: { id }, data: { isLocked: false } });
  }

  // Deposit to vault: deduct from wallet and credit vault atomically
  async depositToVault(userId: string, vaultId: string, dto: any) {
    const vault = await this.getVault(userId, vaultId);
    if (vault.currency !== dto.currency) throw new BadRequestException('Currency mismatch');

    const wallet = await this.prisma.wallet.findUnique({ where: { id: vault.walletId } });
    if (!wallet) throw new NotFoundException('Wallet not found');
    if (wallet.availableBalance.lt(new Prisma.Decimal(dto.amount))) throw new BadRequestException('Insufficient balance');

    // idempotency
    const idempotencyKey = dto.idempotencyKey ?? randomUUID();
    const hash = createHash('sha256').update(JSON.stringify({ userId, vaultId, amount: dto.amount })).digest('hex');
    const existingKey = await this.prisma.idempotencyKey.findUnique({ where: { key: idempotencyKey } });
    if (existingKey) {
      if (existingKey.userId === userId && existingKey.requestHash === hash && existingKey.responseBody) return existingKey.responseBody;
      throw new BadRequestException('Idempotency key conflict');
    }

    const result = await this.prisma.runInTransaction(async (tx) => {
      await tx.idempotencyKey.create({ data: { key: idempotencyKey, userId, endpoint: 'POST /savings/vaults/:id/deposit', requestHash: hash, expiresAt: new Date(Date.now() + 24*60*60*1000) } });

      const transaction = await tx.transaction.create({
        data: {
          reference: `SAV-${Date.now()}`,
          idempotencyKey,
          senderId: userId,
          senderWalletId: wallet.id,
          receiverId: userId,
          receiverWalletId: wallet.id,
          type: TransactionType.VAULT_CONTRIBUTION,
          direction: TransactionDirection.DEBIT,
          amount: new Prisma.Decimal(dto.amount),
          currency: dto.currency,
          fee: new Prisma.Decimal(0),
          netAmount: new Prisma.Decimal(dto.amount),
          status: TransactionStatus.COMPLETED,
          processedAt: new Date(),
          description: `Deposit to vault ${vault.name}`,
        },
      });

      // ledger entries: debit user wallet, credit vault (USER_VAULT)
      await tx.ledgerEntry.createMany({ data: [
        { transactionId: transaction.id, entryType: LedgerEntryType.USER_WALLET, walletId: wallet.id, accountKey: `user:wallet:${wallet.id}`, direction: TransactionDirection.DEBIT, amount: new Prisma.Decimal(dto.amount), currency: dto.currency, balanceBefore: wallet.balance, balanceAfter: wallet.balance.sub(new Prisma.Decimal(dto.amount)), description: `Vault deposit: ${vault.name}` },
        { transactionId: transaction.id, entryType: LedgerEntryType.USER_VAULT, walletId: wallet.id, accountKey: `user:vault:${vault.id}`, direction: TransactionDirection.CREDIT, amount: new Prisma.Decimal(dto.amount), currency: dto.currency, balanceBefore: vault.currentAmount, balanceAfter: vault.currentAmount.add(new Prisma.Decimal(dto.amount)), description: `Vault deposit into ${vault.name}` },
      ]});

      // update wallet balances and vault currentAmount
      await tx.wallet.update({ where: { id: wallet.id }, data: { balance: wallet.balance.sub(new Prisma.Decimal(dto.amount)), availableBalance: wallet.availableBalance.sub(new Prisma.Decimal(dto.amount)) } });

      await tx.savingsVault.update({ where: { id: vault.id }, data: { currentAmount: vault.currentAmount.add(new Prisma.Decimal(dto.amount)) } });

      const response = { transactionId: transaction.id, reference: transaction.reference, idempotencyKey };
      await tx.idempotencyKey.update({ where: { key: idempotencyKey }, data: { responseStatus: 200, responseBody: response } });

      return response;
    });

    return result;
  }

  // Withdraw from vault
  async withdrawFromVault(userId: string, vaultId: string, dto: any) {
    const vault = await this.getVault(userId, vaultId);
    if (vault.isLocked) throw new BadRequestException('Vault is locked');
    const amount = new Prisma.Decimal(dto.amount);
    if (vault.currentAmount.lt(amount)) throw new BadRequestException('Insufficient vault balance');

    const wallet = await this.prisma.wallet.findUnique({ where: { id: vault.walletId } });
    if (!wallet) throw new NotFoundException('Wallet not found');

    // idempotency
    const idempotencyKey = dto.idempotencyKey ?? randomUUID();
    const hash = createHash('sha256').update(JSON.stringify({ userId, vaultId, amount: dto.amount })).digest('hex');
    const existingKey = await this.prisma.idempotencyKey.findUnique({ where: { key: idempotencyKey } });
    if (existingKey) {
      if (existingKey.userId === userId && existingKey.requestHash === hash && existingKey.responseBody) return existingKey.responseBody;
      throw new BadRequestException('Idempotency key conflict');
    }

    const result = await this.prisma.runInTransaction(async (tx) => {
      await tx.idempotencyKey.create({ data: { key: idempotencyKey, userId, endpoint: 'POST /savings/vaults/:id/withdraw', requestHash: hash, expiresAt: new Date(Date.now() + 24*60*60*1000) } });

      const transaction = await tx.transaction.create({ data: {
        reference: `SAV-W-${Date.now()}`,
        idempotencyKey,
        senderId: userId,
        senderWalletId: wallet.id,
        receiverId: userId,
        receiverWalletId: wallet.id,
        type: TransactionType.VAULT_WITHDRAWAL,
        direction: TransactionDirection.CREDIT,
        amount,
        currency: vault.currency,
        fee: new Prisma.Decimal(0),
        netAmount: amount,
        status: TransactionStatus.COMPLETED,
        processedAt: new Date(),
        description: `Withdraw from vault ${vault.name}` } });

      // ledger entries: debit vault, credit wallet
      await tx.ledgerEntry.createMany({ data: [
        { transactionId: transaction.id, entryType: LedgerEntryType.USER_VAULT, vaultId: vault.id, accountKey: `user:vault:${vault.id}`, direction: TransactionDirection.DEBIT, amount, currency: vault.currency, balanceBefore: vault.currentAmount, balanceAfter: vault.currentAmount.sub(amount), description: `Vault withdrawal: ${vault.name}` },
        { transactionId: transaction.id, entryType: LedgerEntryType.USER_WALLET, walletId: wallet.id, accountKey: `user:wallet:${wallet.id}`, direction: TransactionDirection.CREDIT, amount, currency: vault.currency, balanceBefore: wallet.balance, balanceAfter: wallet.balance.add(amount), description: `Vault withdrawal into wallet ${wallet.walletNumber}` },
      ]});

      // update balances
      await tx.savingsVault.update({ where: { id: vault.id }, data: { currentAmount: vault.currentAmount.sub(amount) } });
      await tx.wallet.update({ where: { id: wallet.id }, data: { balance: wallet.balance.add(amount), availableBalance: wallet.availableBalance.add(amount) } });

      const response = { transactionId: transaction.id, reference: transaction.reference, idempotencyKey };
      await tx.idempotencyKey.update({ where: { key: idempotencyKey }, data: { responseStatus: 200, responseBody: response } });

      return response;
    });

    return result;
  }

  // Rules management
  async createRule(userId: string, dto: any) {
    // validate vault/wallet belong to user
    const v = await this.prisma.savingsVault.findUnique({ where: { id: dto.vaultId } });
    if (!v || v.userId !== userId) throw new ForbiddenException('Vault not found');
    return this.prisma.savingsRule.create({ data: { userId, walletId: dto.walletId, vaultId: dto.vaultId, type: dto.type, amount: dto.amount ? new Prisma.Decimal(dto.amount) : null, percentage: dto.percentage, cronExpression: dto.cronExpression, isActive: true } });
  }

  async getRules(userId: string, walletId?: string) {
    return this.prisma.savingsRule.findMany({ where: { userId, walletId } });
  }

  async updateRule(userId: string, id: string, dto: any) {
    const r = await this.prisma.savingsRule.findUnique({ where: { id } });
    if (!r || r.userId !== userId) throw new NotFoundException('Rule not found');
    return this.prisma.savingsRule.update({ where: { id }, data: dto });
  }

  async deleteRule(userId: string, id: string) {
    const r = await this.prisma.savingsRule.findUnique({ where: { id } });
    if (!r || r.userId !== userId) throw new NotFoundException('Rule not found');
    return this.prisma.savingsRule.delete({ where: { id } });
  }

  async toggleRule(userId: string, id: string) {
    const r = await this.prisma.savingsRule.findUnique({ where: { id } });
    if (!r || r.userId !== userId) throw new NotFoundException('Rule not found');
    return this.prisma.savingsRule.update({ where: { id }, data: { isActive: !r.isActive } });
  }

  // Automation engine: apply rules for a single transaction
  async applyRulesForTransaction(txRecord: any) {
    // find active rules for the wallet
    const rules = await this.prisma.savingsRule.findMany({ where: { walletId: txRecord.senderWalletId, isActive: true } });
    for (const rule of rules) {
      try {
        if (rule.type === 'ROUND_UP') {
          const amount = new Prisma.Decimal(txRecord.amount);
          const rounded = amount.ceil();
          const diff = rounded.sub(amount);
          if (diff.gt(0)) {
            // deposit diff to vault
            await this.depositToVault(txRecord.senderId, rule.vaultId, { amount: diff.toString() });
          }
        } else if (rule.type === 'FIXED_AMOUNT') {
          if (rule.amount) await this.depositToVault(txRecord.senderId, rule.vaultId, { amount: rule.amount.toString() });
        } else if (rule.type === 'PERCENTAGE') {
          if (rule.percentage) {
            const amt = new Prisma.Decimal(txRecord.amount).mul(rule.percentage).div(100);
            if (amt.gt(0)) await this.depositToVault(txRecord.senderId, rule.vaultId, { amount: amt.toString() });
          }
        }
      } catch (err) {
        // swallow to avoid blocking original transaction; log for operator review
        await this.prisma.auditLog.create({ data: { userId: txRecord.senderId, action: 'SAVINGS_RULE_FAILED' as any, metadata: { ruleId: rule.id, error: err.message } } });
      }
    }
  }

  // Cron job to run scheduled rules
  async runScheduledRules() {
    const rules = await this.prisma.savingsRule.findMany({ where: { type: 'SCHEDULED', isActive: true } });
    for (const rule of rules) {
      try {
        // For scheduled, simply transfer fixed amount if configured
        if (rule.amount) {
          await this.depositToVault(rule.userId, rule.vaultId, { amount: rule.amount.toString() });
        }
      } catch (err) {
        await this.prisma.auditLog.create({ data: { userId: rule.userId, action: 'SAVINGS_RULE_FAILED' as any, metadata: { ruleId: rule.id, error: err.message } } });
      }
    }
  }
}
