import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NotificationChannel, NotificationStatus, NotificationType } from '@prisma/client';
import * as Expo from 'expo-server-sdk';
import { PrismaService } from '@common/prisma/prisma.service';
import { NotificationJobPayload } from '../notification.constants';

@Injectable()
export class PushChannel {
  private readonly logger = new Logger(PushChannel.name);
  private readonly expo: Expo.Expo | undefined;
  private readonly accessToken: string | undefined;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    this.accessToken = this.config.get<string>('expo.accessToken');
    if (this.accessToken) {
      this.expo = new Expo.Expo({ accessToken: this.accessToken });
    } else {
      this.logger.warn('EXPO_ACCESS_TOKEN not configured — push notifications are disabled');
    }
  }

  async send(payload: NotificationJobPayload): Promise<void> {
    if (!this.expo || !this.accessToken) return;

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

    // Filter valid Expo push tokens
    const validTokens = tokens.filter((token) => Expo.Expo.isExpoPushToken(token));
    
    if (validTokens.length === 0) {
      this.logger.debug(`PUSH: no valid Expo push tokens for user:${payload.userId}`);
      return;
    }

    const messages = validTokens.map((token) => ({
      to: token,
      sound: 'default' as const,
      title: payload.title,
      body: payload.body,
      data: payload.data ?? {},
      ttl: 24 * 60 * 60, // 24 hours
      priority: 'high' as const,
    }));

    try {
      const chunks = this.expo.chunkPushNotifications(messages);
      let successCount = 0;
      let failureCount = 0;

      for (const chunk of chunks) {
        try {
          const results = await this.expo.sendPushNotificationsAsync(chunk);
          results.forEach((result) => {
            if (result.status === 'ok') {
              successCount++;
            } else {
              failureCount++;
              this.logger.warn(`PUSH error for token: ${result.message}`);
            }
          });
        } catch (err) {
          this.logger.error(`PUSH chunk send failed: ${err}`);
          failureCount += chunk.length;
        }
      }

      this.logger.debug(
        `PUSH → user:${payload.userId} success:${successCount} failure:${failureCount}`,
      );

      await this.prisma.notification.create({
        data: {
          userId: payload.userId,
          type: payload.type as NotificationType,
          channel: NotificationChannel.PUSH,
          status: successCount > 0 ? NotificationStatus.SENT : NotificationStatus.FAILED,
          title: payload.title,
          body: payload.body,
          data: (payload.data ?? {}) as object,
          sentAt: new Date(),
          failureReason: failureCount > 0 ? `${failureCount} token(s) failed` : undefined,
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
