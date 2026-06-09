import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query, Req } from '@nestjs/common';
import { Request } from 'express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { AdminFinanceService } from './admin-finance.service';
import { AdminAuth } from '../decorators/admin-auth.decorator';
import { AdminPermission } from '../decorators/admin-permission.decorator';
import { ADMIN_PERMISSIONS } from '../constants/permissions.constant';
import { AdminWalletQueryDto } from './dto/admin-wallet-query.dto';
import { AdminTransactionQueryDto } from './dto/admin-transaction-query.dto';
import { AdminCardQueryDto } from './dto/admin-card-query.dto';
import { AdminVaultQueryDto } from './dto/admin-vault-query.dto';
import { AdminBudgetQueryDto } from './dto/admin-budget-query.dto';
import { AdminSubscriptionQueryDto } from './dto/admin-subscription-query.dto';
import { AdminAuditQueryDto } from './dto/admin-audit-query.dto';
import { AdminReverseTransactionDto } from './dto/admin-reverse-transaction.dto';
import { AdminFlagTransactionDto } from './dto/admin-flag-transaction.dto';

@ApiTags('Admin Finance')
@Controller('admin/finance')
export class AdminFinanceController {
  constructor(private readonly financeService: AdminFinanceService) {}

  /**
   * Financial overview dashboard stats
   */
  @Get('overview')
  @AdminAuth()
  @AdminPermission(ADMIN_PERMISSIONS.TRANSACTIONS_READ)
  @ApiOperation({
    summary: 'Get financial overview',
    description:
      'Aggregate dashboard stats: 24h volume, pending/failed transaction counts, active wallets, and recent activity. Requires transactions:read permission.',
  })
  @ApiBearerAuth()
  @ApiResponse({ status: 200, description: 'Overview stats' })
  async getOverview() {
    return this.financeService.getOverview();
  }

  /**
   * Paginated, searchable, filterable list of all wallets
   */
  @Get('wallets')
  @AdminAuth()
  @AdminPermission(ADMIN_PERMISSIONS.WALLETS_READ)
  @ApiOperation({
    summary: 'List all wallets',
    description:
      'Paginated list of wallets across all users, with search and filters. Requires wallets:read permission.',
  })
  @ApiBearerAuth()
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'currency', required: false, type: String })
  @ApiQuery({ name: 'status', required: false, type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20 })
  @ApiQuery({ name: 'offset', required: false, type: Number, example: 0 })
  @ApiResponse({ status: 200, description: 'List of wallets' })
  async getWallets(@Query() query: AdminWalletQueryDto) {
    return this.financeService.getWallets(query);
  }

  /**
   * Wallet detail with recent transactions
   */
  @Get('wallets/:walletId')
  @AdminAuth()
  @AdminPermission(ADMIN_PERMISSIONS.WALLETS_READ)
  @ApiOperation({
    summary: 'Get wallet by ID',
    description: 'Wallet details with owner info and recent transactions. Requires wallets:read permission.',
  })
  @ApiBearerAuth()
  @ApiResponse({ status: 200, description: 'Wallet details' })
  @ApiResponse({ status: 404, description: 'Wallet not found' })
  async getWalletById(@Param('walletId') walletId: string) {
    return this.financeService.getWalletById(walletId);
  }

  /**
   * Paginated, filterable list of all transactions
   */
  @Get('transactions')
  @AdminAuth()
  @AdminPermission(ADMIN_PERMISSIONS.TRANSACTIONS_READ)
  @ApiOperation({
    summary: 'List all transactions',
    description:
      'Paginated list of transactions across all users, with search, status/type/risk/date filters. Requires transactions:read permission.',
  })
  @ApiBearerAuth()
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'status', required: false, type: String })
  @ApiQuery({ name: 'type', required: false, type: String })
  @ApiQuery({ name: 'minRisk', required: false, type: Number })
  @ApiQuery({ name: 'maxRisk', required: false, type: Number })
  @ApiQuery({ name: 'fromDate', required: false, type: String })
  @ApiQuery({ name: 'toDate', required: false, type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20 })
  @ApiQuery({ name: 'offset', required: false, type: Number, example: 0 })
  @ApiResponse({ status: 200, description: 'List of transactions' })
  async getTransactions(@Query() query: AdminTransactionQueryDto) {
    return this.financeService.getTransactions(query);
  }

  /**
   * Transaction detail with ledger entries and fraud flags
   */
  @Get('transactions/:transactionId')
  @AdminAuth()
  @AdminPermission(ADMIN_PERMISSIONS.TRANSACTIONS_READ)
  @ApiOperation({
    summary: 'Get transaction by ID',
    description:
      'Full transaction details including ledger entries and fraud flags. Requires transactions:read permission.',
  })
  @ApiBearerAuth()
  @ApiResponse({ status: 200, description: 'Transaction details' })
  @ApiResponse({ status: 404, description: 'Transaction not found' })
  async getTransactionById(@Param('transactionId') transactionId: string) {
    return this.financeService.getTransactionById(transactionId);
  }

  /**
   * Paginated, searchable, filterable list of all virtual cards
   * Permission note: reusing wallets:read (cards are wallet-linked instruments) rather than
   * adding a new cards:read key — keeps this accessible to OPS_ADMIN without touching
   * role-permissions.constant.ts. Revisit if cards become their own access domain.
   */
  @Get('virtual-cards')
  @AdminAuth()
  @AdminPermission(ADMIN_PERMISSIONS.WALLETS_READ)
  @ApiOperation({
    summary: 'List all virtual cards',
    description:
      'Paginated list of virtual cards across all users, with search and filters. Never returns encrypted PAN/CVV — only maskedNumber, expiry, and last4. Requires wallets:read permission.',
  })
  @ApiBearerAuth()
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'status', required: false, type: String })
  @ApiQuery({ name: 'type', required: false, type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20 })
  @ApiQuery({ name: 'offset', required: false, type: Number, example: 0 })
  @ApiResponse({ status: 200, description: 'List of virtual cards' })
  async getVirtualCards(@Query() query: AdminCardQueryDto) {
    return this.financeService.getVirtualCards(query);
  }

  /**
   * Virtual card detail with owner + recent card transactions
   */
  @Get('virtual-cards/:cardId')
  @AdminAuth()
  @AdminPermission(ADMIN_PERMISSIONS.WALLETS_READ)
  @ApiOperation({
    summary: 'Get virtual card by ID',
    description:
      'Card details (masked) with owner info and recent card transactions. Requires wallets:read permission.',
  })
  @ApiBearerAuth()
  @ApiResponse({ status: 200, description: 'Virtual card details' })
  @ApiResponse({ status: 404, description: 'Virtual card not found' })
  async getVirtualCardById(@Param('cardId') cardId: string) {
    return this.financeService.getVirtualCardById(cardId);
  }

  /**
   * Paginated, searchable, filterable list of all savings vaults
   * Permission note: reusing wallets:read for consistency with the virtual-cards decision above.
   */
  @Get('vaults')
  @AdminAuth()
  @AdminPermission(ADMIN_PERMISSIONS.WALLETS_READ)
  @ApiOperation({
    summary: 'List all savings vaults',
    description:
      'Paginated list of savings vaults across all users, with search and status filter. Note: SavingsVault has no apy/category fields in the current schema — they are omitted rather than fabricated. Requires wallets:read permission.',
  })
  @ApiBearerAuth()
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'status', required: false, type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20 })
  @ApiQuery({ name: 'offset', required: false, type: Number, example: 0 })
  @ApiResponse({ status: 200, description: 'List of savings vaults' })
  async getVaults(@Query() query: AdminVaultQueryDto) {
    return this.financeService.getVaults(query);
  }

  /**
   * Savings vault detail with owner + recent contributions
   */
  @Get('vaults/:vaultId')
  @AdminAuth()
  @AdminPermission(ADMIN_PERMISSIONS.WALLETS_READ)
  @ApiOperation({
    summary: 'Get savings vault by ID',
    description: 'Vault details with owner info and recent contributions. Requires wallets:read permission.',
  })
  @ApiBearerAuth()
  @ApiResponse({ status: 200, description: 'Savings vault details' })
  @ApiResponse({ status: 404, description: 'Savings vault not found' })
  async getVaultById(@Param('vaultId') vaultId: string) {
    return this.financeService.getVaultById(vaultId);
  }

  /**
   * Paginated, cross-user list of budgets with their category breakdowns
   * Permission note: reusing transactions:read (budgets are spending-control records, closer to
   * transaction analytics than wallet custody) rather than adding a new budgets:read key.
   */
  @Get('budgets')
  @AdminAuth()
  @AdminPermission(ADMIN_PERMISSIONS.TRANSACTIONS_READ)
  @ApiOperation({
    summary: 'List all budgets',
    description:
      'Paginated, cross-user list of budgets joined with their category-budget breakdowns (raw shape — frontend computes percent/unallocated). Requires transactions:read permission.',
  })
  @ApiBearerAuth()
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'status', required: false, type: String })
  @ApiQuery({ name: 'category', required: false, type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20 })
  @ApiQuery({ name: 'offset', required: false, type: Number, example: 0 })
  @ApiResponse({ status: 200, description: 'List of budgets with category breakdowns' })
  async getBudgets(@Query() query: AdminBudgetQueryDto) {
    return this.financeService.getBudgets(query);
  }

  /**
   * Paginated, cross-user list of recurring subscriptions
   * Permission note: reusing transactions:read for consistency with the budgets decision above.
   */
  @Get('subscriptions')
  @AdminAuth()
  @AdminPermission(ADMIN_PERMISSIONS.TRANSACTIONS_READ)
  @ApiOperation({
    summary: 'List all subscriptions',
    description:
      'Paginated, cross-user list of recurring per-user subscription payments (NOT platform pricing plans — see notes). Requires transactions:read permission.',
  })
  @ApiBearerAuth()
  @ApiQuery({ name: 'search', required: false, type: String, description: 'Matches merchantName' })
  @ApiQuery({ name: 'status', required: false, type: String })
  @ApiQuery({ name: 'billingCycle', required: false, type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20 })
  @ApiQuery({ name: 'offset', required: false, type: Number, example: 0 })
  @ApiResponse({ status: 200, description: 'List of subscriptions' })
  async getSubscriptions(@Query() query: AdminSubscriptionQueryDto) {
    return this.financeService.getSubscriptions(query);
  }

  /**
   * Paginated compliance-relevant audit log
   * `result` (Passed/Flagged) and the compliance action subset are derived heuristics — see
   * COMPLIANCE_ACTIONS / FLAGGED_AUDIT_ACTIONS in the service for the placeholder definitions
   * pending compliance team sign-off.
   */
  @Get('compliance/audits')
  @AdminAuth()
  @AdminPermission(ADMIN_PERMISSIONS.AUDIT_READ)
  @ApiOperation({
    summary: 'List compliance-relevant audit log entries',
    description:
      'Paginated AuditLog entries filtered to a compliance-relevant action subset (placeholder taxonomy pending compliance sign-off — see service comments), with a derived `result` (Passed/Flagged). Requires audit:read permission.',
  })
  @ApiBearerAuth()
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'action', required: false, type: String })
  @ApiQuery({ name: 'dateFrom', required: false, type: String })
  @ApiQuery({ name: 'dateTo', required: false, type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20 })
  @ApiQuery({ name: 'offset', required: false, type: Number, example: 0 })
  @ApiResponse({ status: 200, description: 'List of compliance audit entries' })
  async getComplianceAudits(@Query() query: AdminAuditQueryDto) {
    return this.financeService.getComplianceAudits(query);
  }

  @Post('wallets/:walletId/freeze')
  @HttpCode(HttpStatus.OK)
  @AdminAuth()
  @AdminPermission(ADMIN_PERMISSIONS.WALLETS_FREEZE)
  @ApiOperation({ summary: 'Freeze a wallet', description: 'Sets wallet status to FROZEN. Requires wallets:freeze permission.' })
  @ApiBearerAuth()
  @ApiResponse({ status: 200, description: 'Wallet frozen' })
  @ApiResponse({ status: 400, description: 'Wallet already frozen or closed' })
  @ApiResponse({ status: 404, description: 'Wallet not found' })
  async freezeWallet(@Param('walletId') walletId: string, @Req() req: Request) {
    return this.financeService.freezeWallet(walletId, (req.user as { id: string }).id);
  }

  @Post('wallets/:walletId/unfreeze')
  @HttpCode(HttpStatus.OK)
  @AdminAuth()
  @AdminPermission(ADMIN_PERMISSIONS.WALLETS_UNFREEZE)
  @ApiOperation({ summary: 'Unfreeze a wallet', description: 'Sets wallet status back to ACTIVE. Requires wallets:unfreeze permission.' })
  @ApiBearerAuth()
  @ApiResponse({ status: 200, description: 'Wallet unfrozen' })
  @ApiResponse({ status: 400, description: 'Wallet is not frozen' })
  @ApiResponse({ status: 404, description: 'Wallet not found' })
  async unfreezeWallet(@Param('walletId') walletId: string, @Req() req: Request) {
    return this.financeService.unfreezeWallet(walletId, (req.user as { id: string }).id);
  }

  @Post('transactions/:transactionId/reverse')
  @HttpCode(HttpStatus.OK)
  @AdminAuth()
  @AdminPermission(ADMIN_PERMISSIONS.TRANSACTIONS_REVERSE)
  @ApiOperation({
    summary: 'Reverse a transaction',
    description:
      'Marks the transaction REVERSED and writes an audit log. Only COMPLETED or PROCESSING transactions can be reversed. Note: this is a status-only admin action — balance-ledger unwinding must be handled separately by finance ops.',
  })
  @ApiBearerAuth()
  @ApiResponse({ status: 200, description: 'Transaction reversed' })
  @ApiResponse({ status: 400, description: 'Transaction cannot be reversed in its current state' })
  @ApiResponse({ status: 404, description: 'Transaction not found' })
  async reverseTransaction(
    @Param('transactionId') transactionId: string,
    @Body() dto: AdminReverseTransactionDto,
    @Req() req: Request,
  ) {
    return this.financeService.reverseTransaction(transactionId, (req.user as { id: string }).id, dto);
  }

  @Post('transactions/:transactionId/flag')
  @HttpCode(HttpStatus.OK)
  @AdminAuth()
  @AdminPermission(ADMIN_PERMISSIONS.TRANSACTIONS_MARK_SUSPECT)
  @ApiOperation({
    summary: 'Flag a transaction as suspicious',
    description:
      'Sets transaction status to REQUIRES_ACTION, creates a FraudFlag record, and writes an audit log. Requires transactions:mark_suspect permission.',
  })
  @ApiBearerAuth()
  @ApiResponse({ status: 200, description: 'Transaction flagged' })
  @ApiResponse({ status: 400, description: 'Transaction is already flagged' })
  @ApiResponse({ status: 404, description: 'Transaction not found' })
  async flagTransaction(
    @Param('transactionId') transactionId: string,
    @Body() dto: AdminFlagTransactionDto,
    @Req() req: Request,
  ) {
    return this.financeService.flagTransaction(transactionId, (req.user as { id: string }).id, dto);
  }

  @Post('virtual-cards/:cardId/freeze')
  @HttpCode(HttpStatus.OK)
  @AdminAuth()
  @AdminPermission(ADMIN_PERMISSIONS.WALLETS_FREEZE)
  @ApiOperation({ summary: 'Freeze a virtual card', description: 'Sets virtual card status to FROZEN. Requires wallets:freeze permission.' })
  @ApiBearerAuth()
  @ApiResponse({ status: 200, description: 'Card frozen' })
  @ApiResponse({ status: 400, description: 'Card already frozen, expired, or cancelled' })
  @ApiResponse({ status: 404, description: 'Virtual card not found' })
  async freezeVirtualCard(@Param('cardId') cardId: string, @Req() req: Request) {
    return this.financeService.freezeVirtualCard(cardId, (req.user as { id: string }).id);
  }

  @Post('virtual-cards/:cardId/unfreeze')
  @HttpCode(HttpStatus.OK)
  @AdminAuth()
  @AdminPermission(ADMIN_PERMISSIONS.WALLETS_UNFREEZE)
  @ApiOperation({ summary: 'Unfreeze a virtual card', description: 'Sets virtual card status back to ACTIVE. Requires wallets:unfreeze permission.' })
  @ApiBearerAuth()
  @ApiResponse({ status: 200, description: 'Card unfrozen' })
  @ApiResponse({ status: 400, description: 'Card is not frozen' })
  @ApiResponse({ status: 404, description: 'Virtual card not found' })
  async unfreezeVirtualCard(@Param('cardId') cardId: string, @Req() req: Request) {
    return this.financeService.unfreezeVirtualCard(cardId, (req.user as { id: string }).id);
  }

  @Get('cash-flow')
  @AdminAuth()
  @AdminPermission(ADMIN_PERMISSIONS.TRANSACTIONS_READ)
  @ApiOperation({
    summary: 'Get cash flow summary',
    description:
      'Aggregated inflow (CREDIT) vs outflow (DEBIT) of completed transactions by currency across 24h/7d/30d windows, plus a 30d breakdown by transaction type. Built from real Transaction data — not corridor-based metrics.',
  })
  @ApiBearerAuth()
  @ApiResponse({ status: 200, description: 'Cash flow aggregations' })
  async getCashFlow() {
    return this.financeService.getCashFlow();
  }
}
