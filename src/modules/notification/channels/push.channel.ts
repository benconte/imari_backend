import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NotificationChannel, NotificationStatus, NotificationType } from '@prisma/client';
import { PrismaService } from '@common/prisma/prisma.service';
import { NotificationJobPayload } from '../notification.constants';

const FCM_ENDPOINT = 'https://fcm.googleapis.com/fcm/send';

@Injectable()
export class PushChannel {
  private readonly logger = new Logger(PushChannel.name);
  private readonly serverKey: string | undefined;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    this.serverKey = this.config.get<string>('firebase.fcmServerKey');
    if (!this.serverKey) {
      this.logger.warn('FCM_SERVER_KEY not configured — push notifications are disabled');
    }
  }

  async send(payload: NotificationJobPayload): Promise<void> {
    if (!this.serverKey) return;

    // Collect all push tokens for this user across their devices
    const devices = await this.prisma.userDevice.findMany({
      where: { userId: payload.userId, pushToken: { not: null } },
      select: { pushToken: true },
    });

    if (!devices.length) {
      this.logger.debug(`PUSH: no push tokens for user:${payload.userId}`);
      return;
    }

    const tokens = devices.map((d) => d.pushToken as string);

    const fcmBody = {
      registration_ids: tokens,
      notification: { title: payload.title, body: payload.body },
      data: payload.data ?? {},
      priority: 'high',
    };

    try {
      const response = await fetch(FCM_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `key=${this.serverKey}`,
        },
        body: JSON.stringify(fcmBody),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`FCM ${response.status}: ${text}`);
      }

      const result = (await response.json()) as { success: number; failure: number };
      this.logger.debug(
        `PUSH → user:${payload.userId} success:${result.success} failure:${result.failure}`,
      );

      await this.prisma.notification.create({
        data: {
          userId: payload.userId,
          type: payload.type as NotificationType,
          channel: NotificationChannel.PUSH,
          status: result.success > 0 ? NotificationStatus.SENT : NotificationStatus.FAILED,
          title: payload.title,
          body: payload.body,
          data: (payload.data ?? {}) as object,
          sentAt: new Date(),
          failureReason: result.failure > 0 ? `${result.failure} token(s) failed` : undefined,
        },
      });
    } catch (err) {
      this.logger.error(`PUSH failed for user:${payload.userId}`, err);
      await this.prisma.notification.create({
        data: {
          userId: payload.userId,
          type: payload.type as NotificationType,
          channel: NotificationChannel.PUSH,
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
