import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Currency,
  LedgerEntryType,
  NotificationChannel,
  NotificationType,
  PaymentProvider,
  Prisma,
  TransactionDirection,
  TransactionStatus,
  TransactionType,
  UserStatus,
  WalletStatus,
  WebhookEventStatus,
} from '@prisma/client';
import axios, { AxiosError } from 'axios';
import { PrismaService } from '@common/prisma/prisma.service';
import { generateTransactionRef } from '@common/utils/reference.util';
import { InitializePaymentDto } from './dto/initialize-payment.dto';
import {
  CreditWalletParams,
  FlutterwaveWebhookPayload,
  FlwInitializeResponse,
  FlwVerifyData,
  FlwVerifyResponse,
  InitializePaymentResult,
} from './types/flutterwave.types';
import { validateFlutterwaveSignature } from './helpers/flutterwave-signature.helper';

// Full transaction shape with provider and wallet joins for webhook processing
type TransactionWithRelations = Prisma.TransactionGetPayload<{
  include: { receiverWallet: true; providerTransaction: true };
}>;

@Injectable()
export class FlutterwaveService {
  private readonly logger = new Logger(FlutterwaveService.name);

  private readonly flwBaseUrl: string;
  private readonly clientId: string;     // FLUTTERWAVE_CLIENT_ID   (formerly Public Key)
  private readonly clientSecret: string; // FLUTTERWAVE_CLIENT_SECRET (formerly Secret Key) — Bearer token
  private readonly webhookHash: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    this.flwBaseUrl = this.config.get<string>(
      'flutterwave.baseUrl',
      'https://api.flutterwave.com/v3',
    );
    this.clientId     = this.config.get<string>('flutterwave.clientId', '');
    this.clientSecret = this.config.get<string>('flutterwave.clientSecret', '');
    this.webhookHash  = this.config.get<string>('flutterwave.webhookHash', '');

    if (!this.clientSecret) {
      this.logger.warn('FLUTTERWAVE_CLIENT_SECRET is not set. Payment endpoints will be unavailable.');
    } else {
      // Log the key prefix on startup — confirms the right value was loaded from .env
      this.logger.log(
        `Flutterwave ready — clientSecret: ${this.clientSecret.substring(0, 20)}...`,
      );
    }
  }


  async initializePayment(
    userId: string,
    dto: InitializePaymentDto,
  ): Promise<InitializePaymentResult> {
    this.ensureConfigured();

    const currency = dto.currency ?? Currency.RWF;

    // Fetch user profile for email / name defaults
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        status: true,
      },
    });

    if (!user || user.status !== UserStatus.ACTIVE) {
      throw new BadRequestException('User account is not active');
    }

    const wallet = await this.resolveWallet(userId, currency, dto.walletId);

    const txRef = generateTransactionRef(); // IMR-TXN-XXXXXXXXXX — used as Flutterwave tx_ref
    const amount = new Prisma.Decimal(dto.amount);

    const customerEmail = dto.email ?? user.email;
    const customerName = dto.name ?? `${user.firstName} ${user.lastName}`;
    const customerPhone = dto.phone ?? user.phone ?? '';

    // RWF supports mobile money (MTN MoMo / Airtel Money) + card; other currencies: card only
    const paymentOptions = currency === Currency.RWF ? 'mobilemoney,card' : 'card';

    const flwPayload = {
      tx_ref: txRef,
      amount: dto.amount,
      currency,
      redirect_url: dto.redirectUrl ?? 'https://imari.app/payment/callback',
      customer: {
        email: customerEmail,
        name: customerName,
        phone_number: customerPhone,
      },
      payment_options: paymentOptions,
      customizations: {
        title: 'Imari Wallet Top-up',
        description: `Fund your ${currency} Imari wallet`,
        logo: '',
      },
      // Embed routing metadata so the webhook handler can credit the right wallet
      meta: {
        userId: user.id,
        walletId: wallet.id,
        internalTxRef: txRef,
      },
    };

    // Persist records BEFORE calling the API so we always have an audit trail
    const { transaction, providerTx } = await this.prisma.$transaction(async (tx) => {
      const transaction = await tx.transaction.create({
        data: {
          reference: txRef,
          receiverId: userId,
          receiverWalletId: wallet.id,
          type: TransactionType.DEPOSIT,
          direction: TransactionDirection.CREDIT,
          amount,
          currency,
          fee: new Prisma.Decimal(0),
          netAmount: amount,
          status: TransactionStatus.PENDING,
          description: 'Flutterwave wallet top-up',
          metadata: {
            source: 'flutterwave',
            customerEmail,
            initiatedAt: new Date().toISOString(),
          } as Prisma.JsonObject,
        },
      });

      const providerTx = await tx.paymentProviderTransaction.create({
        data: {
          transactionId: transaction.id,
          provider: PaymentProvider.FLUTTERWAVE,
          // Use txRef as initial provider reference; updated to FLW ID on webhook
          providerReference: txRef,
          providerStatus: 'pending_initialization',
          paymentMethod: currency === Currency.RWF ? 'mobilemoney_rwanda' : 'card',
          requestPayload: flwPayload as unknown as Prisma.JsonObject,
        },
      });

      return { transaction, providerTx };
    });

    // Call Flutterwave API outside the DB transaction to avoid holding locks
    let paymentLink: string;
    try {
      const response = await this.flwPost<FlwInitializeResponse>('/payments', flwPayload);

      if (response.status !== 'success' || !response.data?.link) {
        throw new Error(response.message ?? 'Flutterwave returned no payment link');
      }

      paymentLink = response.data.link;
    } catch (error) {
      // Mark as FAILED so orphaned PENDING records don't pollute the ledger
      const errMsg = this.extractError(error);
      await Promise.all([
        this.prisma.transaction.update({
          where: { id: transaction.id },
          data: {
            status: TransactionStatus.FAILED,
            failureReason: `Flutterwave API error: ${errMsg}`,
          },
        }),
        this.prisma.paymentProviderTransaction.update({
          where: { id: providerTx.id },
          data: { providerStatus: 'initialization_failed', errorMessage: errMsg },
        }),
      ]);

      this.logger.error(`Payment init failed [userId=${userId}]: ${errMsg}`);
      throw new InternalServerErrorException(
        'Payment initialization failed. Please try again.',
      );
    }

    // Record the checkout link in the provider transaction for reference
    await this.prisma.paymentProviderTransaction.update({
      where: { id: providerTx.id },
      data: {
        providerStatus: 'initialized',
        responsePayload: { link: paymentLink } as Prisma.JsonObject,
      },
    });

    this.logger.log(
      `Payment initialized [userId=${userId}, txRef=${txRef}, amount=${dto.amount} ${currency}]`,
    );

    return { paymentLink, txRef, transactionId: transaction.id };
  }

  /**
   * Calls the Flutterwave verify endpoint directly for the given FLW transaction ID.
   * The caller receives the raw Flutterwave verification object.
   *
   * @param flwTransactionId  Numeric Flutterwave transaction ID (from callback or webhook).
   */
  async verifyTransaction(flwTransactionId: string): Promise<FlwVerifyData> {
    this.ensureConfigured();
    this.logger.log(`Verifying Flutterwave transaction: ${flwTransactionId}`);

    try {
      const response = await this.flwGet<FlwVerifyResponse>(
        `/transactions/${flwTransactionId}/verify`,
      );

      if (response.status !== 'success') {
        throw new BadRequestException(
          `Verification failed: ${response.message ?? 'Unknown error from Flutterwave'}`,
        );
      }

      return response.data;
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      this.logger.error(
        `Verification error [flwId=${flwTransactionId}]: ${this.extractError(error)}`,
      );
      throw new InternalServerErrorException(
        'Transaction verification failed. Please try again.',
      );
    }
  }

  /**
   * Entry point for all Flutterwave webhook events.
   *
   * Security model:
   *  1. Validate `verif-hash` header with constant-time comparison → reject spoofed requests.
   *  2. Upsert a WebhookEvent record for idempotency tracking (unique on providerEventId).
   *  3. Route `charge.completed` events through the wallet-credit pipeline.
   *  4. Non-200 responses tell Flutterwave to retry; returning early keeps DB consistent.
   */
  async handleWebhook(
    payload: FlutterwaveWebhookPayload,
    signature: string,
  ): Promise<void> {
    // Step 1: Reject requests with an invalid or missing verif-hash header
    if (!validateFlutterwaveSignature(signature, this.webhookHash)) {
      this.logger.warn(
        `Webhook rejected: invalid verif-hash [event=${payload?.event}, txRef=${payload?.data?.tx_ref}]`,
      );
      throw new UnauthorizedException('Invalid webhook signature');
    }

    const event = payload.event;
    const flwId = payload.data?.id;
    const flwTransactionId = flwId ? String(flwId) : '';

    this.logger.log(
      `Webhook received [event=${event}, flwId=${flwTransactionId}, txRef=${payload.data?.tx_ref}]`,
    );

    // Malformed event: no transaction ID — log and discard
    if (!flwTransactionId) {
      this.logger.warn('Malformed webhook: missing data.id. Discarding.');
      await this.prisma.webhookEvent.create({
        data: {
          provider: PaymentProvider.FLUTTERWAVE,
          eventType: event ?? 'unknown',
          signatureValid: true,
          payload: payload as unknown as Prisma.JsonObject,
          status: WebhookEventStatus.IGNORED,
          errorMessage: 'Missing data.id in payload',
        },
      });
      return;
    }

    // Step 2: Upsert the webhook event record
    // On duplicate delivery (FLW retries), increment retryCount and reset to RECEIVED
    // so the processing logic re-runs, but the PENDING→PROCESSING CAS inside creditWallet
    // ensures the wallet is only credited once.
    const webhookEvent = await this.prisma.webhookEvent.upsert({
      where: { providerEventId: flwTransactionId },
      create: {
        provider: PaymentProvider.FLUTTERWAVE,
        eventType: event,
        providerEventId: flwTransactionId,
        signature,
        signatureValid: true,
        payload: payload as unknown as Prisma.JsonObject,
        status: WebhookEventStatus.RECEIVED,
      },
      update: {
        retryCount: { increment: 1 },
        // Reset to RECEIVED so we re-evaluate; wallet CAS prevents double credit
        status: WebhookEventStatus.RECEIVED,
      },
    });

    // Step 3: Route events
    if (event === 'charge.completed') {
      await this.processChargeCompleted(webhookEvent.id, payload);
    } else {
      this.logger.log(`Unhandled webhook event type "${event}". Ignoring.`);
      await this.prisma.webhookEvent.update({
        where: { id: webhookEvent.id },
        data: { status: WebhookEventStatus.IGNORED },
      });
    }
  }

  // ─── Internal Processing Pipeline ────────────────────────────────────────────

  /**
   * Processes a `charge.completed` Flutterwave webhook event:
   *  1. Marks webhook as PROCESSING.
   *  2. Finds the internal Transaction by tx_ref.
   *  3. Independently verifies the charge with Flutterwave API.
   *  4. Validates amount and currency match.
   *  5. Delegates atomic wallet credit to `creditWallet()`.
   */
  private async processChargeCompleted(
    webhookEventId: string,
    payload: FlutterwaveWebhookPayload,
  ): Promise<void> {
    const {
      tx_ref: txRef,
      id: flwId,
      flw_ref: flwRef,
    } = payload.data;
    const flwTransactionId = String(flwId);

    await this.setWebhookStatus(webhookEventId, WebhookEventStatus.PROCESSING);

    try {
      // ── 1. Find the corresponding internal transaction ──────────────────────
      const transaction: TransactionWithRelations | null =
        await this.prisma.transaction.findUnique({
          where: { reference: txRef },
          include: { receiverWallet: true, providerTransaction: true },
        });

      if (!transaction) {
        this.logger.warn(`Webhook: no transaction for txRef=${txRef}`);
        await this.setWebhookStatus(
          webhookEventId,
          WebhookEventStatus.IGNORED,
          'Transaction not found in database',
        );
        return;
      }

      if (!transaction.receiverId || !transaction.receiverWalletId) {
        this.logger.error(`Webhook: transaction ${transaction.id} missing receiver data`);
        await this.setWebhookStatus(
          webhookEventId,
          WebhookEventStatus.FAILED,
          'Transaction missing receiverId or receiverWalletId',
        );
        return;
      }

      // ── 2. Re-verify with Flutterwave API (never trust webhook data alone) ──
      // This guards against spoofed webhook bodies where amount/status is manipulated.
      let verified: FlwVerifyData;
      try {
        verified = await this.verifyTransaction(flwTransactionId);
      } catch (err) {
        this.logger.error(
          `Webhook: FLW API verification failed [txRef=${txRef}]: ${err.message}`,
        );
        await this.setWebhookStatus(
          webhookEventId,
          WebhookEventStatus.FAILED,
          `Verification API error: ${err.message}`,
        );
        throw err; // Non-200 → Flutterwave will retry
      }

      // ── 3. Check payment status ─────────────────────────────────────────────
      if (verified.status !== 'successful') {
        this.logger.warn(
          `Webhook: payment not successful [txRef=${txRef}, flw_status=${verified.status}]`,
        );
        await this.prisma.transaction.update({
          where: { id: transaction.id },
          data: {
            status: TransactionStatus.FAILED,
            failureReason: `Flutterwave status: ${verified.status}`,
          },
        });
        await this.setWebhookStatus(webhookEventId, WebhookEventStatus.PROCESSED);
        return;
      }

      // ── 4. Security: confirm amount matches what we originally requested ────
      const verifiedAmount = new Prisma.Decimal(verified.amount);
      if (!verifiedAmount.equals(transaction.amount)) {
        const msg =
          `Amount mismatch: expected=${transaction.amount}, ` +
          `flw_verified=${verified.amount} [txRef=${txRef}]`;
        this.logger.error(`Webhook: ${msg}`);
        // Not retriable — this is a potential fraud signal
        await this.setWebhookStatus(webhookEventId, WebhookEventStatus.FAILED, msg);
        return;
      }

      // ── 5. Security: confirm currency matches ───────────────────────────────
      if (verified.currency !== String(transaction.currency)) {
        const msg =
          `Currency mismatch: expected=${transaction.currency}, ` +
          `flw_verified=${verified.currency} [txRef=${txRef}]`;
        this.logger.error(`Webhook: ${msg}`);
        await this.setWebhookStatus(webhookEventId, WebhookEventStatus.FAILED, msg);
        return;
      }

      // ── 6. Atomically credit the wallet ────────────────────────────────────
      await this.creditWallet({
        transactionId: transaction.id,
        walletId: transaction.receiverWalletId,
        userId: transaction.receiverId,
        amount: verifiedAmount,
        currency: transaction.currency,
        flwTransactionId,
        flwRef: flwRef ?? '',
        providerTransactionId: transaction.providerTransaction?.id,
        webhookEventId,
        existingMetadata: transaction.metadata,
        webhookPayload: payload,
      });

      this.logger.log(
        `Wallet credited [userId=${transaction.receiverId}, ` +
        `txRef=${txRef}, amount=${verifiedAmount} ${transaction.currency}, flwId=${flwTransactionId}]`,
      );
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      const errStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(
        `Webhook processing error [txRef=${txRef}]: ${errMsg}`,
        errStack,
      );
      await this.setWebhookStatus(
        webhookEventId,
        WebhookEventStatus.FAILED,
        errMsg,
      ).catch(() => {});
      throw error; // Bubble up → 500 → Flutterwave retries
    }
  }

  /**
   * Atomically credits the user's wallet inside a single Prisma transaction.
   *
   * Idempotency guard: The `updateMany(WHERE status = PENDING)` acts as an
   * atomic compare-and-swap. If two concurrent deliveries of the same webhook
   * race, only the first one transitions PENDING → PROCESSING (count = 1).
   * The second sees count = 0 and returns early — the wallet is credited exactly once.
   *
   * Double-entry accounting:
   *   CREDIT  USER_WALLET      wallet:<walletId>        (+amount)
   *   DEBIT   EXTERNAL_PROVIDER external:flutterwave   (+amount)
   * Debits = Credits per transaction (standard double-entry invariant).
   */
  private async creditWallet(params: CreditWalletParams): Promise<void> {
    const {
      transactionId,
      walletId,
      userId,
      amount,
      currency,
      flwTransactionId,
      flwRef,
      providerTransactionId,
      webhookEventId,
      existingMetadata,
      webhookPayload,
    } = params;

    await this.prisma.$transaction(async (tx) => {
      // ── Idempotency: atomic CAS — only one concurrent caller proceeds ────────
      const claimed = await tx.transaction.updateMany({
        where: { id: transactionId, status: TransactionStatus.PENDING },
        data: { status: TransactionStatus.PROCESSING },
      });

      if (claimed.count === 0) {
        // Either already PROCESSING by a concurrent request or already COMPLETED
        this.logger.log(
          `CAS: transaction ${transactionId} already claimed or completed. Skipping.`,
        );
        return;
      }

      // ── Fetch current wallet state inside the transaction ────────────────────
      const wallet = await tx.wallet.findUnique({ where: { id: walletId } });

      if (!wallet || wallet.status !== WalletStatus.ACTIVE) {
        await tx.transaction.update({
          where: { id: transactionId },
          data: {
            status: TransactionStatus.FAILED,
            failureReason: 'Wallet not found or not active at credit time',
          },
        });
        throw new BadRequestException('Target wallet is not active');
      }

      const balanceBefore = wallet.balance;
      const balanceAfter = balanceBefore.add(amount);

      // ── Credit wallet ────────────────────────────────────────────────────────
      await tx.wallet.update({
        where: { id: walletId },
        data: {
          balance: { increment: amount },
          availableBalance: { increment: amount },
          updatedAt: new Date(),
        },
      });

      // ── Double-entry ledger entries ──────────────────────────────────────────
      await tx.ledgerEntry.createMany({
        data: [
          {
            transactionId,
            entryType: LedgerEntryType.USER_WALLET,
            walletId,
            accountKey: `wallet:${walletId}`,
            direction: TransactionDirection.CREDIT,
            amount,
            currency,
            balanceBefore,
            balanceAfter,
            description: `Flutterwave deposit — FLW ID: ${flwTransactionId}`,
          },
          {
            transactionId,
            entryType: LedgerEntryType.EXTERNAL_PROVIDER,
            accountKey: 'external:flutterwave',
            direction: TransactionDirection.DEBIT,
            amount,
            currency,
            description: 'Flutterwave payment inflow',
          },
        ],
      });

      // ── Finalize transaction ─────────────────────────────────────────────────
      await tx.transaction.update({
        where: { id: transactionId },
        data: {
          status: TransactionStatus.COMPLETED,
          processedAt: new Date(),
          metadata: {
            ...((existingMetadata as Record<string, unknown>) ?? {}),
            flwTransactionId,
            flwRef,
            completedAt: new Date().toISOString(),
          } as Prisma.JsonObject,
        },
      });

      // ── Update PaymentProviderTransaction ────────────────────────────────────
      if (providerTransactionId) {
        await tx.paymentProviderTransaction.update({
          where: { id: providerTransactionId },
          data: {
            providerReference: flwTransactionId,
            webhookConfirmed: true,
            webhookConfirmedAt: new Date(),
            providerStatus: 'successful',
            settledAt: new Date(),
            responsePayload: webhookPayload as unknown as Prisma.JsonObject,
          },
        });
      }

      // ── Mark webhook event as fully processed ────────────────────────────────
      await tx.webhookEvent.update({
        where: { id: webhookEventId },
        data: { status: WebhookEventStatus.PROCESSED, processedAt: new Date() },
      });

      // ── Create in-app payment confirmation notification ───────────────────────
      await tx.notification.create({
        data: {
          userId,
          type: NotificationType.PAYMENT_CONFIRMATION,
          channel: NotificationChannel.IN_APP,
          title: 'Wallet Funded Successfully',
          body: `Your wallet has been credited with ${amount} ${currency}`,
          data: {
            transactionId,
            amount: amount.toString(),
            currency,
            flwTransactionId,
          } as Prisma.JsonObject,
        },
      });
    });
  }

  // ─── Flutterwave HTTP Client Helpers ─────────────────────────────────────────
  // Flutterwave v3: clientSecret (FLWSECK_TEST-...) is used directly as Bearer token.
  // validateStatus: () => true prevents axios from throwing on 4xx/5xx so we can
  // log the FULL response body and surface the real error message.

  private async flwPost<T>(path: string, body: unknown): Promise<T> {
    const response = await axios.post<T>(`${this.flwBaseUrl}${path}`, body, {
      headers: {
        Authorization: `Bearer ${this.clientSecret}`,
        'Content-Type': 'application/json',
      },
      timeout: 30_000,
      validateStatus: () => true, // handle status ourselves
    });

    if (response.status < 200 || response.status >= 300) {
      const raw = JSON.stringify(response.data);
      this.logger.error(
        `FLW API POST ${path} → HTTP ${response.status}: ${raw}`,
      );
      const msg = (response.data as Record<string, string>)?.message ?? raw;
      throw new Error(msg);
    }

    return response.data;
  }

  private async flwGet<T>(path: string): Promise<T> {
    const response = await axios.get<T>(`${this.flwBaseUrl}${path}`, {
      headers: { Authorization: `Bearer ${this.clientSecret}` },
      timeout: 30_000,
      validateStatus: () => true,
    });

    if (response.status < 200 || response.status >= 300) {
      const raw = JSON.stringify(response.data);
      this.logger.error(
        `FLW API GET ${path} → HTTP ${response.status}: ${raw}`,
      );
      const msg = (response.data as Record<string, string>)?.message ?? raw;
      throw new Error(msg);
    }

    return response.data;
  }

  // ─── Internal Utilities ───────────────────────────────────────────────────────

  /**
   * Finds the user's wallet for a given currency.
   * Prefers the wallet explicitly named by walletId, then the primary wallet,
   * then any active wallet in the requested currency.
   */
  private async resolveWallet(
    userId: string,
    currency: Currency,
    walletId?: string,
  ) {
    if (walletId) {
      const wallet = await this.prisma.wallet.findFirst({
        where: { id: walletId, userId, status: WalletStatus.ACTIVE },
      });
      if (!wallet) {
        throw new BadRequestException(
          'Wallet not found or does not belong to your account',
        );
      }
      return wallet;
    }

    const wallet = await this.prisma.wallet.findFirst({
      where: { userId, currency, status: WalletStatus.ACTIVE },
      orderBy: { isPrimary: 'desc' },
    });

    if (!wallet) {
      throw new BadRequestException(
        `No active ${currency} wallet found. Please create a ${currency} wallet first.`,
      );
    }

    return wallet;
  }

  private ensureConfigured(): void {
    // clientSecret is the only key used for server-side API calls (Bearer token).
    // clientId (public key) is for client-side embeds only — not required here.
    if (!this.clientSecret) {
      throw new InternalServerErrorException(
        'Flutterwave is not configured. Set FLUTTERWAVE_CLIENT_SECRET in environment variables.',
      );
    }
  }

  /** Extracts a human-readable error message from Axios or generic errors. */
  private extractError(error: unknown): string {
    if (error instanceof AxiosError) {
      return (
        (error.response?.data as Record<string, string>)?.message ??
        (error.response?.data as Record<string, string>)?.error ??
        error.message
      );
    }
    if (error instanceof Error) return error.message;
    return String(error);
  }

  /** Convenience wrapper to update WebhookEvent status + optional error message. */
  private async setWebhookStatus(
    id: string,
    status: WebhookEventStatus,
    errorMessage?: string,
  ): Promise<void> {
    await this.prisma.webhookEvent
      .update({
        where: { id },
        data: {
          status,
          ...(status === WebhookEventStatus.PROCESSED && { processedAt: new Date() }),
          ...(errorMessage && { errorMessage }),
        },
      })
      .catch((e) =>
        this.logger.error(`Failed to update WebhookEvent ${id}: ${e.message}`),
      );
  }
}
