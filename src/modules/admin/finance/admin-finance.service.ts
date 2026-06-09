import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  AuditAction,
  Prisma,
  TransactionDirection,
  TransactionStatus,
  VirtualCardStatus,
  WalletStatus,
} from '@prisma/client';
import { PrismaService } from '@common/prisma/prisma.service';
import { toDecimalString } from '@common/utils/money.util';
import { AdminWalletQueryDto } from './dto/admin-wallet-query.dto';
import { AdminTransactionQueryDto } from './dto/admin-transaction-query.dto';
import { AdminCardQueryDto } from './dto/admin-card-query.dto';
import { AdminVaultQueryDto } from './dto/admin-vault-query.dto';
import { AdminBudgetQueryDto } from './dto/admin-budget-query.dto';
import { AdminSubscriptionQueryDto } from './dto/admin-subscription-query.dto';
import { AdminAuditQueryDto } from './dto/admin-audit-query.dto';
import { AdminReverseTransactionDto } from './dto/admin-reverse-transaction.dto';
import { AdminFlagTransactionDto } from './dto/admin-flag-transaction.dto';

const OWNER_SELECT = { id: true, firstName: true, lastName: true, email: true } as const;
const OWNER_SELECT_BASIC = { id: true, firstName: true, lastName: true } as const;

const WALLET_SELECT = {
  id: true,
  walletNumber: true,
  currency: true,
  balance: true,
  availableBalance: true,
  dailyLimit: true,
  monthlyLimit: true,
  isPrimary: true,
  isLocked: true,
  status: true,
  createdAt: true,
  user: { select: OWNER_SELECT },
} as const;

const TRANSACTION_SELECT = {
  id: true,
  reference: true,
  amount: true,
  fee: true,
  netAmount: true,
  currency: true,
  type: true,
  direction: true,
  status: true,
  riskScore: true,
  createdAt: true,
  sender: { select: OWNER_SELECT },
  receiver: { select: OWNER_SELECT },
  senderWallet: { select: { walletNumber: true } },
  receiverWallet: { select: { walletNumber: true } },
} as const;

function formatWallet<
  T extends {
    balance: Prisma.Decimal;
    availableBalance: Prisma.Decimal;
    dailyLimit: Prisma.Decimal | null;
    monthlyLimit: Prisma.Decimal | null;
    user: { id: string; firstName: string; lastName: string; email: string };
  },
>(wallet: T) {
  const { user, ...rest } = wallet;
  return {
    ...rest,
    balance: toDecimalString(wallet.balance),
    availableBalance: toDecimalString(wallet.availableBalance),
    dailyLimit: toDecimalString(wallet.dailyLimit),
    monthlyLimit: toDecimalString(wallet.monthlyLimit),
    owner: user,
  };
}

function formatTransaction<T extends { amount: Prisma.Decimal; fee: Prisma.Decimal; netAmount: Prisma.Decimal }>(
  tx: T,
) {
  return {
    ...tx,
    amount: toDecimalString(tx.amount),
    fee: toDecimalString(tx.fee),
    netAmount: toDecimalString(tx.netAmount),
  };
}

const VIRTUAL_CARD_SELECT = {
  id: true,
  maskedNumber: true,
  cardNumberLast4: true,
  expiryMonth: true,
  expiryYear: true,
  cardHolder: true,
  type: true,
  status: true,
  currency: true,
  spendingLimit: true,
  dailyLimit: true,
  spentToday: true,
  spentTotal: true,
  createdAt: true,
  user: { select: OWNER_SELECT },
} as const;

// PCI-adjacent fields (cardNumberEnc, cvvEnc, cvvLastRotatedAt) are intentionally excluded —
// the admin UI only ever needs maskedNumber/expiry/last4.
function formatVirtualCard<
  T extends {
    spendingLimit: Prisma.Decimal | null;
    dailyLimit: Prisma.Decimal | null;
    spentToday: Prisma.Decimal;
    spentTotal: Prisma.Decimal;
    user: { id: string; firstName: string; lastName: string; email: string };
  },
>(card: T) {
  const { user, ...rest } = card;
  return {
    ...rest,
    spendingLimit: toDecimalString(card.spendingLimit),
    dailyLimit: toDecimalString(card.dailyLimit),
    spentToday: toDecimalString(card.spentToday),
    spentTotal: toDecimalString(card.spentTotal),
    owner: user,
  };
}

const VAULT_SELECT = {
  id: true,
  name: true,
  targetAmount: true,
  currentAmount: true,
  currency: true,
  status: true,
  isLocked: true,
  lockUntil: true,
  createdAt: true,
  user: { select: OWNER_SELECT_BASIC },
} as const;

function formatVault<
  T extends {
    targetAmount: Prisma.Decimal;
    currentAmount: Prisma.Decimal;
    user: { id: string; firstName: string; lastName: string };
  },
>(vault: T) {
  const { user, ...rest } = vault;
  return {
    ...rest,
    targetAmount: toDecimalString(vault.targetAmount),
    currentAmount: toDecimalString(vault.currentAmount),
    owner: user,
  };
}

const BUDGET_SELECT = {
  id: true,
  name: true,
  period: true,
  status: true,
  totalLimit: true,
  totalSpent: true,
  currency: true,
  createdAt: true,
  user: { select: OWNER_SELECT_BASIC },
  categoryBudgets: { select: { category: true, limit: true, spent: true, alertAt: true } },
} as const;

function formatBudget<
  T extends {
    totalLimit: Prisma.Decimal;
    totalSpent: Prisma.Decimal;
    user: { id: string; firstName: string; lastName: string };
    categoryBudgets: { category: string; limit: Prisma.Decimal; spent: Prisma.Decimal; alertAt: number }[];
  },
>(budget: T) {
  const { user, categoryBudgets, ...rest } = budget;
  return {
    ...rest,
    totalLimit: toDecimalString(budget.totalLimit),
    totalSpent: toDecimalString(budget.totalSpent),
    owner: user,
    categoryBudgets: categoryBudgets.map((cb) => ({
      category: cb.category,
      limit: toDecimalString(cb.limit),
      spent: toDecimalString(cb.spent),
      alertAt: cb.alertAt,
    })),
  };
}

const SUBSCRIPTION_SELECT = {
  id: true,
  merchantName: true,
  amount: true,
  currency: true,
  billingCycle: true,
  status: true,
  nextBillingDate: true,
  lastBilledAt: true,
  createdAt: true,
  user: { select: OWNER_SELECT_BASIC },
} as const;

function formatSubscription<
  T extends { amount: Prisma.Decimal; user: { id: string; firstName: string; lastName: string } },
>(sub: T) {
  const { user, ...rest } = sub;
  return { ...rest, amount: toDecimalString(sub.amount), owner: user };
}

// Placeholder default — AuditAction enum has no dedicated "compliance" category, and product/compliance
// haven't signed off on which actions belong in this report. This subset (KYC outcomes, suspicious
// activity, admin actions, card freezes, MFA/device changes) is a reasonable starting guess; revisit
// once compliance defines the real taxonomy.
const COMPLIANCE_ACTIONS: AuditAction[] = [
  AuditAction.KYC_SUBMITTED,
  AuditAction.KYC_VERIFIED,
  AuditAction.KYC_REJECTED,
  AuditAction.SUSPICIOUS_ACTIVITY,
  AuditAction.ADMIN_ACTION,
  AuditAction.CARD_FROZEN,
  AuditAction.CARD_UNFROZEN,
  AuditAction.MFA_ENABLED,
  AuditAction.MFA_DISABLED,
  AuditAction.DEVICE_REGISTERED,
  AuditAction.DEVICE_REMOVED,
];

// Placeholder heuristic — AuditLog has no "result" field. Until compliance defines what makes an
// entry "Flagged" vs "Passed", we derive it from the action itself (rejections/suspicious activity
// read as flagged, everything else as passed). Revisit once a real definition exists.
const FLAGGED_AUDIT_ACTIONS = new Set<AuditAction>([AuditAction.SUSPICIOUS_ACTIVITY, AuditAction.KYC_REJECTED]);

@Injectable()
export class AdminFinanceService {
  constructor(private readonly prisma: PrismaService) {}

  async getOverview() {
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [volumeAgg, pendingCount, failedCount, activeWalletsCount, recent] = await Promise.all([
      this.prisma.transaction.aggregate({
        where: { status: TransactionStatus.COMPLETED, createdAt: { gte: since24h } },
        _sum: { amount: true },
      }),
      this.prisma.transaction.count({
        where: { status: { in: [TransactionStatus.PENDING, TransactionStatus.PROCESSING] } },
      }),
      this.prisma.transaction.count({ where: { status: TransactionStatus.FAILED } }),
      this.prisma.wallet.count({ where: { status: WalletStatus.ACTIVE } }),
      this.prisma.transaction.findMany({
        take: 8,
        orderBy: { createdAt: 'desc' },
        select: TRANSACTION_SELECT,
      }),
    ]);

    return {
      volumeLast24h: toDecimalString(volumeAgg._sum.amount ?? new Prisma.Decimal(0)),
      pendingCount,
      failedCount,
      activeWalletsCount,
      recentTransactions: recent.map(formatTransaction),
    };
  }

  async getWallets(query: AdminWalletQueryDto) {
    const where: Prisma.WalletWhereInput = {};

    if (query.currency) where.currency = query.currency;
    if (query.status) where.status = query.status;

    if (query.search) {
      where.OR = [
        { walletNumber: { contains: query.search, mode: 'insensitive' } },
        { user: { is: { firstName: { contains: query.search, mode: 'insensitive' } } } },
        { user: { is: { lastName: { contains: query.search, mode: 'insensitive' } } } },
        { user: { is: { email: { contains: query.search, mode: 'insensitive' } } } },
      ];
    }

    const [wallets, total] = await Promise.all([
      this.prisma.wallet.findMany({
        where,
        take: query.limit,
        skip: query.offset,
        orderBy: { createdAt: 'desc' },
        select: WALLET_SELECT,
      }),
      this.prisma.wallet.count({ where }),
    ]);

    return { wallets: wallets.map(formatWallet), total };
  }

  async getWalletById(walletId: string) {
    const wallet = await this.prisma.wallet.findUnique({
      where: { id: walletId },
      select: WALLET_SELECT,
    });
    if (!wallet) throw new NotFoundException('Wallet not found');

    const transactions = await this.prisma.transaction.findMany({
      where: { OR: [{ senderWalletId: walletId }, { receiverWalletId: walletId }] },
      take: 20,
      orderBy: { createdAt: 'desc' },
      select: TRANSACTION_SELECT,
    });

    return {
      ...formatWallet(wallet),
      recentTransactions: transactions.map(formatTransaction),
    };
  }

  async getTransactions(query: AdminTransactionQueryDto) {
    const where: Prisma.TransactionWhereInput = {};

    if (query.status) where.status = query.status;
    if (query.type) where.type = query.type;

    if (query.minRisk !== undefined || query.maxRisk !== undefined) {
      where.riskScore = {};
      if (query.minRisk !== undefined) where.riskScore.gte = query.minRisk;
      if (query.maxRisk !== undefined) where.riskScore.lte = query.maxRisk;
    }

    if (query.fromDate || query.toDate) {
      where.createdAt = {};
      if (query.fromDate) where.createdAt.gte = new Date(query.fromDate);
      if (query.toDate) where.createdAt.lte = new Date(query.toDate);
    }

    if (query.search) {
      const nameMatch: Prisma.UserWhereInput = {
        OR: [
          { firstName: { contains: query.search, mode: 'insensitive' } },
          { lastName: { contains: query.search, mode: 'insensitive' } },
          { email: { contains: query.search, mode: 'insensitive' } },
        ],
      };
      where.OR = [
        { reference: { contains: query.search, mode: 'insensitive' } },
        { sender: { is: nameMatch } },
        { receiver: { is: nameMatch } },
      ];
    }

    const [transactions, total] = await Promise.all([
      this.prisma.transaction.findMany({
        where,
        take: query.limit,
        skip: query.offset,
        orderBy: { createdAt: 'desc' },
        select: TRANSACTION_SELECT,
      }),
      this.prisma.transaction.count({ where }),
    ]);

    return { transactions: transactions.map(formatTransaction), total };
  }

  async getTransactionById(transactionId: string) {
    const tx = await this.prisma.transaction.findUnique({
      where: { id: transactionId },
      select: {
        ...TRANSACTION_SELECT,
        description: true,
        merchantName: true,
        failureReason: true,
        processedAt: true,
        reversedAt: true,
        ledgerEntries: {
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            entryType: true,
            accountKey: true,
            direction: true,
            amount: true,
            currency: true,
            balanceBefore: true,
            balanceAfter: true,
            description: true,
            createdAt: true,
          },
        },
        fraudFlags: {
          select: { id: true, reason: true, riskScore: true, signals: true, createdAt: true },
        },
      },
    });
    if (!tx) throw new NotFoundException('Transaction not found');

    const { ledgerEntries, fraudFlags, ...rest } = tx;

    return {
      ...formatTransaction(rest),
      ledgerEntries: ledgerEntries.map((entry) => ({
        ...entry,
        amount: toDecimalString(entry.amount),
        balanceBefore: toDecimalString(entry.balanceBefore),
        balanceAfter: toDecimalString(entry.balanceAfter),
      })),
      fraudFlags,
    };
  }

  async getVirtualCards(query: AdminCardQueryDto) {
    const where: Prisma.VirtualCardWhereInput = {};

    if (query.status) where.status = query.status;
    if (query.type) where.type = query.type;

    if (query.search) {
      where.OR = [
        { maskedNumber: { contains: query.search, mode: 'insensitive' } },
        { cardHolder: { contains: query.search, mode: 'insensitive' } },
        { user: { is: { firstName: { contains: query.search, mode: 'insensitive' } } } },
        { user: { is: { lastName: { contains: query.search, mode: 'insensitive' } } } },
        { user: { is: { email: { contains: query.search, mode: 'insensitive' } } } },
      ];
    }

    const [cards, total] = await Promise.all([
      this.prisma.virtualCard.findMany({
        where,
        take: query.limit,
        skip: query.offset,
        orderBy: { createdAt: 'desc' },
        select: VIRTUAL_CARD_SELECT,
      }),
      this.prisma.virtualCard.count({ where }),
    ]);

    return { cards: cards.map(formatVirtualCard), total };
  }

  async getVirtualCardById(cardId: string) {
    const card = await this.prisma.virtualCard.findUnique({
      where: { id: cardId },
      select: VIRTUAL_CARD_SELECT,
    });
    if (!card) throw new NotFoundException('Virtual card not found');

    const cardTransactions = await this.prisma.cardTransaction.findMany({
      where: { cardId },
      take: 20,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        merchantName: true,
        merchantCity: true,
        merchantCountry: true,
        mcc: true,
        amount: true,
        currency: true,
        authStatus: true,
        authorizedAt: true,
        capturedAt: true,
        reversedAt: true,
        declineReason: true,
        createdAt: true,
      },
    });

    return {
      ...formatVirtualCard(card),
      recentTransactions: cardTransactions.map((t) => ({ ...t, amount: toDecimalString(t.amount) })),
    };
  }

  async getVaults(query: AdminVaultQueryDto) {
    const where: Prisma.SavingsVaultWhereInput = {};

    if (query.status) where.status = query.status;

    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { user: { is: { firstName: { contains: query.search, mode: 'insensitive' } } } },
        { user: { is: { lastName: { contains: query.search, mode: 'insensitive' } } } },
        { user: { is: { email: { contains: query.search, mode: 'insensitive' } } } },
      ];
    }

    const [vaults, total] = await Promise.all([
      this.prisma.savingsVault.findMany({
        where,
        take: query.limit,
        skip: query.offset,
        orderBy: { createdAt: 'desc' },
        select: VAULT_SELECT,
      }),
      this.prisma.savingsVault.count({ where }),
    ]);

    return { vaults: vaults.map(formatVault), total };
  }

  async getVaultById(vaultId: string) {
    const vault = await this.prisma.savingsVault.findUnique({
      where: { id: vaultId },
      select: VAULT_SELECT,
    });
    if (!vault) throw new NotFoundException('Savings vault not found');

    const contributions = await this.prisma.savingsContribution.findMany({
      where: { vaultId },
      take: 20,
      orderBy: { createdAt: 'desc' },
      select: { id: true, amount: true, currency: true, source: true, createdAt: true },
    });

    return {
      ...formatVault(vault),
      recentContributions: contributions.map((c) => ({ ...c, amount: toDecimalString(c.amount) })),
    };
  }

  async getBudgets(query: AdminBudgetQueryDto) {
    const where: Prisma.BudgetWhereInput = {};

    if (query.status) where.status = query.status;
    if (query.category) where.categoryBudgets = { some: { category: query.category } };

    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { user: { is: { firstName: { contains: query.search, mode: 'insensitive' } } } },
        { user: { is: { lastName: { contains: query.search, mode: 'insensitive' } } } },
        { user: { is: { email: { contains: query.search, mode: 'insensitive' } } } },
      ];
    }

    const [budgets, total] = await Promise.all([
      this.prisma.budget.findMany({
        where,
        take: query.limit,
        skip: query.offset,
        orderBy: { createdAt: 'desc' },
        select: BUDGET_SELECT,
      }),
      this.prisma.budget.count({ where }),
    ]);

    return { budgets: budgets.map(formatBudget), total };
  }

  async getSubscriptions(query: AdminSubscriptionQueryDto) {
    const where: Prisma.SubscriptionWhereInput = {};

    if (query.status) where.status = query.status;
    if (query.billingCycle) where.billingCycle = query.billingCycle;
    if (query.search) where.merchantName = { contains: query.search, mode: 'insensitive' };

    const [subscriptions, total] = await Promise.all([
      this.prisma.subscription.findMany({
        where,
        take: query.limit,
        skip: query.offset,
        orderBy: { createdAt: 'desc' },
        select: SUBSCRIPTION_SELECT,
      }),
      this.prisma.subscription.count({ where }),
    ]);

    return { subscriptions: subscriptions.map(formatSubscription), total };
  }

  async getComplianceAudits(query: AdminAuditQueryDto) {
    const where: Prisma.AuditLogWhereInput = {
      action: query.action ?? { in: COMPLIANCE_ACTIONS },
    };

    if (query.dateFrom || query.dateTo) {
      where.createdAt = {};
      if (query.dateFrom) where.createdAt.gte = new Date(query.dateFrom);
      if (query.dateTo) where.createdAt.lte = new Date(query.dateTo);
    }

    if (query.search) {
      where.OR = [
        { resource: { contains: query.search, mode: 'insensitive' } },
        { user: { is: { firstName: { contains: query.search, mode: 'insensitive' } } } },
        { user: { is: { lastName: { contains: query.search, mode: 'insensitive' } } } },
        { user: { is: { email: { contains: query.search, mode: 'insensitive' } } } },
      ];
    }

    const [logs, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        take: query.limit,
        skip: query.offset,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          action: true,
          resource: true,
          adminId: true,
          metadata: true,
          createdAt: true,
          user: { select: OWNER_SELECT },
        },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    const adminIds = [...new Set(logs.map((log) => log.adminId).filter((id): id is string => !!id))];
    const admins = adminIds.length
      ? await this.prisma.adminUser.findMany({
          where: { id: { in: adminIds } },
          select: { id: true, firstName: true, lastName: true, email: true },
        })
      : [];
    const adminById = new Map(admins.map((admin) => [admin.id, admin]));

    return {
      audits: logs.map((log) => ({
        ...log,
        admin: log.adminId ? (adminById.get(log.adminId) ?? null) : null,
        // see FLAGGED_AUDIT_ACTIONS — placeholder heuristic pending a real "result" definition
        result: FLAGGED_AUDIT_ACTIONS.has(log.action) ? 'Flagged' : 'Passed',
      })),
      total,
    };
  }

  async freezeWallet(walletId: string, adminId: string) {
    const wallet = await this.prisma.wallet.findUnique({
      where: { id: walletId },
      select: { id: true, status: true, userId: true },
    });
    if (!wallet) throw new NotFoundException('Wallet not found');
    if (wallet.status === WalletStatus.CLOSED) throw new BadRequestException('Cannot freeze a closed wallet');
    if (wallet.status === WalletStatus.FROZEN) throw new BadRequestException('Wallet is already frozen');

    await this.prisma.$transaction([
      this.prisma.wallet.update({ where: { id: walletId }, data: { status: WalletStatus.FROZEN } }),
      this.prisma.auditLog.create({
        data: {
          userId: wallet.userId,
          adminId,
          action: AuditAction.ADMIN_ACTION,
          resource: `wallet:${walletId}`,
          metadata: { action: 'WALLET_FROZEN' },
        },
      }),
    ]);
    return { id: walletId, status: WalletStatus.FROZEN };
  }

  async unfreezeWallet(walletId: string, adminId: string) {
    const wallet = await this.prisma.wallet.findUnique({
      where: { id: walletId },
      select: { id: true, status: true, userId: true },
    });
    if (!wallet) throw new NotFoundException('Wallet not found');
    if (wallet.status !== WalletStatus.FROZEN) throw new BadRequestException('Wallet is not frozen');

    await this.prisma.$transaction([
      this.prisma.wallet.update({ where: { id: walletId }, data: { status: WalletStatus.ACTIVE } }),
      this.prisma.auditLog.create({
        data: {
          userId: wallet.userId,
          adminId,
          action: AuditAction.ADMIN_ACTION,
          resource: `wallet:${walletId}`,
          metadata: { action: 'WALLET_UNFROZEN' },
        },
      }),
    ]);
    return { id: walletId, status: WalletStatus.ACTIVE };
  }

  async reverseTransaction(transactionId: string, adminId: string, dto: AdminReverseTransactionDto) {
    const tx = await this.prisma.transaction.findUnique({
      where: { id: transactionId },
      select: { id: true, status: true, senderId: true },
    });
    if (!tx) throw new NotFoundException('Transaction not found');
    if (tx.status === TransactionStatus.REVERSED) throw new BadRequestException('Transaction is already reversed');
    if (tx.status !== TransactionStatus.COMPLETED && tx.status !== TransactionStatus.PROCESSING) {
      throw new BadRequestException(`Cannot reverse a transaction with status ${tx.status}`);
    }

    // Admin-only status reversal — marks the transaction REVERSED and writes an audit trail.
    // Full balance-ledger unwinding (credit back sender, debit receiver) is a separate
    // accounting operation that must be handled by finance ops after this flag is set.
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.transaction.update({
        where: { id: transactionId },
        data: { status: TransactionStatus.REVERSED, reversedAt: now },
      }),
      this.prisma.auditLog.create({
        data: {
          userId: tx.senderId ?? null,
          adminId,
          action: AuditAction.ADMIN_ACTION,
          resource: `transaction:${transactionId}`,
          metadata: { action: 'TRANSACTION_REVERSED', reason: dto.reason ?? null },
        },
      }),
    ]);
    return { id: transactionId, status: TransactionStatus.REVERSED, reversedAt: now };
  }

  async flagTransaction(transactionId: string, adminId: string, dto: AdminFlagTransactionDto) {
    const tx = await this.prisma.transaction.findUnique({
      where: { id: transactionId },
      select: { id: true, status: true, senderId: true },
    });
    if (!tx) throw new NotFoundException('Transaction not found');
    if (tx.status === TransactionStatus.REQUIRES_ACTION) {
      throw new BadRequestException('Transaction is already flagged');
    }

    const riskScore = dto.riskScore ?? 75;
    await this.prisma.$transaction([
      this.prisma.transaction.update({
        where: { id: transactionId },
        data: { status: TransactionStatus.REQUIRES_ACTION },
      }),
      this.prisma.fraudFlag.create({
        data: {
          transactionId,
          reason: dto.reason,
          riskScore,
          signals: { flaggedByAdmin: adminId, note: dto.reason },
        },
      }),
      this.prisma.auditLog.create({
        data: {
          userId: tx.senderId ?? null,
          adminId,
          action: AuditAction.SUSPICIOUS_ACTIVITY,
          resource: `transaction:${transactionId}`,
          metadata: { reason: dto.reason, riskScore },
        },
      }),
    ]);
    return { id: transactionId, status: TransactionStatus.REQUIRES_ACTION };
  }

  async freezeVirtualCard(cardId: string, adminId: string) {
    const card = await this.prisma.virtualCard.findUnique({
      where: { id: cardId },
      select: { id: true, status: true, userId: true },
    });
    if (!card) throw new NotFoundException('Virtual card not found');
    if (card.status === VirtualCardStatus.EXPIRED || card.status === VirtualCardStatus.CANCELLED) {
      throw new BadRequestException(`Cannot freeze a ${card.status.toLowerCase()} card`);
    }
    if (card.status === VirtualCardStatus.FROZEN) throw new BadRequestException('Virtual card is already frozen');

    await this.prisma.$transaction([
      this.prisma.virtualCard.update({ where: { id: cardId }, data: { status: VirtualCardStatus.FROZEN } }),
      this.prisma.auditLog.create({
        data: {
          userId: card.userId,
          adminId,
          action: AuditAction.CARD_FROZEN,
          resource: `virtual_card:${cardId}`,
          metadata: { frozenByAdmin: adminId },
        },
      }),
    ]);
    return { id: cardId, status: VirtualCardStatus.FROZEN };
  }

  async unfreezeVirtualCard(cardId: string, adminId: string) {
    const card = await this.prisma.virtualCard.findUnique({
      where: { id: cardId },
      select: { id: true, status: true, userId: true },
    });
    if (!card) throw new NotFoundException('Virtual card not found');
    if (card.status !== VirtualCardStatus.FROZEN) throw new BadRequestException('Virtual card is not frozen');

    await this.prisma.$transaction([
      this.prisma.virtualCard.update({ where: { id: cardId }, data: { status: VirtualCardStatus.ACTIVE } }),
      this.prisma.auditLog.create({
        data: {
          userId: card.userId,
          adminId,
          action: AuditAction.CARD_UNFROZEN,
          resource: `virtual_card:${cardId}`,
          metadata: { unfrozenByAdmin: adminId },
        },
      }),
    ]);
    return { id: cardId, status: VirtualCardStatus.ACTIVE };
  }

  async getCashFlow() {
    const now = new Date();
    const since24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const since7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const since30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const makeFlowQuery = (direction: TransactionDirection, since: Date) =>
      this.prisma.transaction.groupBy({
        by: ['currency'],
        where: { status: TransactionStatus.COMPLETED, direction, createdAt: { gte: since } },
        _sum: { amount: true },
        _count: { _all: true },
      });

    const [
      inflow24h, outflow24h,
      inflow7d, outflow7d,
      inflow30d, outflow30d,
      byType,
    ] = await Promise.all([
      makeFlowQuery(TransactionDirection.CREDIT, since24h),
      makeFlowQuery(TransactionDirection.DEBIT, since24h),
      makeFlowQuery(TransactionDirection.CREDIT, since7d),
      makeFlowQuery(TransactionDirection.DEBIT, since7d),
      makeFlowQuery(TransactionDirection.CREDIT, since30d),
      makeFlowQuery(TransactionDirection.DEBIT, since30d),
      this.prisma.transaction.groupBy({
        by: ['type', 'currency'],
        where: { status: TransactionStatus.COMPLETED, createdAt: { gte: since30d } },
        _sum: { amount: true },
        _count: { _all: true },
      }),
    ]);

    const toRows = (rows: { currency: string; _sum: { amount: Prisma.Decimal | null }; _count: { _all: number } }[]) =>
      rows.map((r) => ({
        currency: r.currency,
        amount: toDecimalString(r._sum.amount ?? new Prisma.Decimal(0)),
        count: r._count._all,
      }));

    return {
      windows: {
        h24: { inflow: toRows(inflow24h), outflow: toRows(outflow24h) },
        d7: { inflow: toRows(inflow7d), outflow: toRows(outflow7d) },
        d30: { inflow: toRows(inflow30d), outflow: toRows(outflow30d) },
      },
      byType: byType.map((r) => ({
        type: r.type,
        currency: r.currency,
        amount: toDecimalString(r._sum.amount ?? new Prisma.Decimal(0)),
        count: r._count._all,
      })),
    };
  }
}
