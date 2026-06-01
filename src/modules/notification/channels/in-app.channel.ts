import { Injectable, Logger } from '@nestjs/common';
import { NotificationChannel, NotificationStatus, NotificationType } from '@prisma/client';
import { PrismaService } from '@common/prisma/prisma.service';
import { NotificationGateway } from '../notification.gateway';
import { NotificationJobPayload } from '../notification.constants';

@Injectable()
export class InAppChannel {
  private readonly logger = new Logger(InAppChannel.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: NotificationGateway,
  ) {}

  async send(payload: NotificationJobPayload): Promise<void> {
    const notification = await this.prisma.notification.create({
      data: {
        userId: payload.userId,
        type: payload.type as NotificationType,
        channel: NotificationChannel.IN_APP,
        status: NotificationStatus.DELIVERED,
        title: payload.title,
        body: payload.body,
        data: (payload.data ?? {}) as object,
        actionUrl: payload.actionUrl,
        sentAt: new Date(),
        deliveredAt: new Date(),
      },
    });

    this.gateway.emitToUser(payload.userId, 'notification', {
      id: notification.id,
      type: notification.type,
      title: notification.title,
      body: notification.body,
      data: notification.data,
      actionUrl: notification.actionUrl,
      createdAt: notification.createdAt,
    });

    this.logger.debug(`IN_APP → user:${payload.userId} [${payload.type}]`);
  }
}
