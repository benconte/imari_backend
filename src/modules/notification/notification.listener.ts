import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { NotificationPreference } from '@prisma/client';
import { PrismaService } from '@common/prisma/prisma.service';
import {
  BudgetAlertEvent,
  NOTIFICATION_EVENTS,
  SavingsGoalReachedEvent,
  SecurityEvent,
  SubscriptionReminderEvent,
  TransactionCompletedEvent,
} from './notification.events';
import {
  DIGEST_ELIGIBLE_TYPES,
  JOB_OPTIONS,
  NOTIFICATION_JOBS,
  NOTIFICATION_QUEUE,
  NotificationJobPayload,
} from './notification.constants';

@Injectable()
export class NotificationListener {
  private readonly logger = new Logger(NotificationListener.name);

  constructor(
    @InjectQueue(NOTIFICATION_QUEUE) private readonly queue: Queue,
    private readonly prisma: PrismaService,
  ) {}

  @OnEvent(NOTIFICATION_EVENTS.TRANSACTION_COMPLETED, { async: true })
  async onTransactionCompleted(event: TransactionCompletedEvent): Promise<void> {
    // Notify sender (debit confirmation)
    if (event.senderId && event.type === 'P2P_TRANSFER') {
      await this.routeNotification({
        userId: event.senderId,
        type: 'PAYMENT_CONFIRMATION',
        title: 'Transfer sent',
        body: `You sent ${event.currency} ${event.amount} to ${event.receiverName ?? 'recipient'}.`,
        data: {
          transactionId: event.transactionId,
          reference: event.reference,
          amount: event.amount,
          currency: event.currency,
          type: event.type,
          counterparty: event.receiverName,
          counterpartyLabel: 'To',
          processedAt: event.processedAt?.toISOString(),
        },
      });
    }

    // Notify receiver (credit alert)
    if (event.receiverId) {
      const notifType =
        event.type === 'DEPOSIT' ? 'PAYMENT_CONFIRMATION' : 'TRANSACTION_ALERT';

      await this.routeNotification({
        userId: event.receiverId,
        type: notifType,
        title: event.type === 'DEPOSIT' ? 'Deposit received' : 'Money received',
        body: `You received ${event.currency} ${event.amount}${event.senderName ? ` from ${event.senderName}` : ''}.`,
        data: {
          transactionId: event.transactionId,
          reference: event.reference,
          amount: event.amount,
          currency: event.currency,
          type: event.type,
          counterparty: event.senderName,
          counterpartyLabel: 'From',
          processedAt: event.processedAt?.toISOString(),
        },
      });
    }
  }

  @OnEvent(NOTIFICATION_EVENTS.SECURITY_EVENT, { async: true })
  async onSecurityEvent(event: SecurityEvent): Promise<void> {
    const labels: Record<SecurityEvent['eventType'], string> = {
      PASSWORD_CHANGED: 'Your password was changed',
      MFA_ENABLED: 'Two-factor authentication enabled',
      MFA_DISABLED: 'Two-factor authentication disabled',
      NEW_LOGIN: 'New login detected on your account',
    };

    await this.routeNotification({
      userId: event.userId,
      type: 'SECURITY_WARNING',
      title: labels[event.eventType],
      body: `Security event: ${event.eventType.replace(/_/g, ' ').toLowerCase()} at ${event.timestamp.toISOString()}`,
      data: {
        eventType: event.eventType,
        ipAddress: event.ipAddress,
        timestamp: event.timestamp.toISOString(),
      },
    });
  }

  @OnEvent(NOTIFICATION_EVENTS.BUDGET_ALERT, { async: true })
  async onBudgetAlert(event: BudgetAlertEvent): Promise<void> {
    await this.routeNotification({
      userId: event.userId,
      type: 'BUDGET_ALERT',
      title: `Budget alert — ${event.categoryName}`,
      body: `You've used ${event.percentUsed}% of your ${event.categoryName} budget (${event.currency} ${event.spent} of ${event.limit}).`,
      data: {
        categoryName: event.categoryName,
        spent: event.spent,
        limit: event.limit,
        percentUsed: event.percentUsed,
        currency: event.currency,
      },
    });
  }

  @OnEvent(NOTIFICATION_EVENTS.SAVINGS_GOAL_REACHED, { async: true })
  async onSavingsGoalReached(event: SavingsGoalReachedEvent): Promise<void> {
    await this.routeNotification({
      userId: event.userId,
      type: 'SAVINGS_UPDATE',
      title: 'Savings goal reached! 🎉',
      body: `Your vault "${event.vaultName}" has reached its goal of ${event.currency} ${event.targetAmount}.`,
      data: {
        vaultName: event.vaultName,
        targetAmount: event.targetAmount,
        currency: event.currency,
      },
    });
  }

  @OnEvent(NOTIFICATION_EVENTS.SUBSCRIPTION_REMINDER, { async: true })
  async onSubscriptionReminder(event: SubscriptionReminderEvent): Promise<void> {
    await this.routeNotification({
      userId: event.userId,
      type: 'SUBSCRIPTION_REMINDER',
      title: `Upcoming subscription: ${event.subscriptionName}`,
      body: `${event.currency} ${event.amount} will be charged on ${new Date(event.nextBillingDate).toLocaleDateString()}.`,
      data: {
        subscriptionName: event.subscriptionName,
        amount: event.amount,
        currency: event.currency,
        nextBillingDate: event.nextBillingDate.toISOString(),
      },
    });
  }

  // ── Core routing logic ────────────────────────────────────────────────────

  private async routeNotification(notif: NotificationJobPayload): Promise<void> {
    try {
      const prefs = await this.getOrCreatePrefs(notif.userId);

      // Skip if type is muted
      if (prefs.mutedTypes.includes(notif.type as any)) {
        this.logger.debug(`Muted [${notif.type}] for user:${notif.userId}`);
        return;
      }

      const quiet = this.isQuietHours(prefs);

      for (const channel of prefs.channels) {
        if (channel === 'IN_APP') {
          // In-app always delivers — never suppressed by quiet hours
          await this.queue.add(NOTIFICATION_JOBS.SEND_IN_APP, notif, JOB_OPTIONS);
          continue;
        }

        // Both PUSH and EMAIL are suppressed during quiet hours
        if (quiet) {
          this.logger.debug(
            `Quiet hours — suppressing ${channel} [${notif.type}] for user:${notif.userId}`,
          );
          continue;
        }

        if (channel === 'EMAIL') {
          // Low-priority types are silently dropped when digest mode is on.
          // A separate scheduler (not in this sprint) batches and sends digests.
          if (prefs.emailDigest && DIGEST_ELIGIBLE_TYPES.has(notif.type)) {
            this.logger.debug(
              `Email digest mode — deferring ${notif.type} for user:${notif.userId}`,
            );
            continue;
          }
          await this.queue.add(NOTIFICATION_JOBS.SEND_EMAIL, notif, JOB_OPTIONS);
          continue;
        }

        if (channel === 'PUSH') {
          await this.queue.add(NOTIFICATION_JOBS.SEND_PUSH, notif, JOB_OPTIONS);
        }
      }
    } catch (err) {
      this.logger.error(`routeNotification failed for user:${notif.userId}`, err);
    }
  }

  private async getOrCreatePrefs(userId: string): Promise<NotificationPreference> {
    return this.prisma.notificationPreference.upsert({
      where: { userId },
      create: { userId },
      update: {},
    });
  }

  /**
   * Returns true when the current moment in the user's timezone falls within
   * their configured quiet window. Handles overnight ranges (e.g. 22:00→07:00).
   */
  private isQuietHours(prefs: NotificationPreference): boolean {
    if (!prefs.quietFrom || !prefs.quietTo) return false;

    try {
      const formatted = new Intl.DateTimeFormat('en-GB', {
        timeZone: prefs.timezone,
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(new Date());

      const toMinutes = (hhmm: string) => {
        const [h, m] = hhmm.split(':').map(Number);
        return h * 60 + m;
      };

      const now = toMinutes(formatted);
      const from = toMinutes(prefs.quietFrom);
      const to = toMinutes(prefs.quietTo);

      // Overnight window: quietFrom > quietTo (e.g. 22:00 → 07:00)
      return from > to ? now >= from || now < to : now >= from && now < to;
    } catch {
      return false;
    }
  }
}
