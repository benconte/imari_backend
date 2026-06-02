import { Injectable, Logger } from '@nestjs/common';
import { NotificationChannel, NotificationStatus, NotificationType } from '@prisma/client';
import { PrismaService } from '@common/prisma/prisma.service';
import { EmailService } from '../../../integrations/email/email.service';
import { NotificationJobPayload } from '../notification.constants';

// Map notification type → template name + subject builder
const TYPE_TO_TEMPLATE: Record<
  string,
  { templateName: string; subject: (p: NotificationJobPayload) => string }
> = {
  TRANSACTION_ALERT: {
    templateName: 'transaction-receipt',
    subject: (p) => p.title,
  },
  PAYMENT_CONFIRMATION: {
    templateName: 'transaction-receipt',
    subject: (p) => p.title,
  },
  SECURITY_WARNING: {
    templateName: 'security-warning',
    subject: () => 'Security alert — action may be required',
  },
  BUDGET_ALERT: {
    templateName: 'budget-alert',
    subject: (p) => p.title,
  },
  SUBSCRIPTION_REMINDER: {
    templateName: 'subscription-reminder',
    subject: (p) => p.title,
  },
};

const FALLBACK_TEMPLATE = 'transaction-receipt';

@Injectable()
export class EmailChannel {
  private readonly logger = new Logger(EmailChannel.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
  ) {}

  async send(payload: NotificationJobPayload): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.userId },
      select: { email: true, firstName: true },
    });

    if (!user) {
      this.logger.warn(`EMAIL: user not found for userId ${payload.userId}`);
      return;
    }

    const mapping = TYPE_TO_TEMPLATE[payload.type] ?? {
      templateName: FALLBACK_TEMPLATE,
      subject: (p: NotificationJobPayload) => p.title,
    };

    try {
      await this.emailService.sendNotification({
        to: user.email,
        firstName: user.firstName,
        subject: mapping.subject(payload),
        templateName: mapping.templateName,
        templateData: {
          title: payload.title,
          body: payload.body,
          ...(payload.data ?? {}),
        },
      });

      await this.prisma.notification.create({
        data: {
          userId: payload.userId,
          type: payload.type as NotificationType,
          channel: NotificationChannel.EMAIL,
          status: NotificationStatus.SENT,
          title: payload.title,
          body: payload.body,
          data: (payload.data ?? {}) as object,
          sentAt: new Date(),
        },
      });

      this.logger.debug(`EMAIL → ${user.email} [${payload.type}]`);
    } catch (err) {
      this.logger.error(`EMAIL failed for user:${payload.userId}`, err);
      await this.prisma.notification.create({
        data: {
          userId: payload.userId,
          type: payload.type as NotificationType,
          channel: NotificationChannel.EMAIL,
          status: NotificationStatus.FAILED,
          title: payload.title,
          body: payload.body,
          data: (payload.data ?? {}) as object,
          failedAt: new Date(),
          failureReason: err instanceof Error ? err.message : 'unknown',
        },
      });
    }
  }
}
