import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { EmailChannel } from './channels/email.channel';
import { InAppChannel } from './channels/in-app.channel';
import { PushChannel } from './channels/push.channel';
import { NOTIFICATION_JOBS, NOTIFICATION_QUEUE, NotificationJobPayload } from './notification.constants';

@Processor(NOTIFICATION_QUEUE)
export class NotificationProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationProcessor.name);

  constructor(
    private readonly inApp: InAppChannel,
    private readonly email: EmailChannel,
    private readonly push: PushChannel,
  ) {
    super();
  }

  async process(job: Job<NotificationJobPayload>): Promise<void> {
    switch (job.name) {
      case NOTIFICATION_JOBS.SEND_IN_APP:
        await this.inApp.send(job.data);
        break;
      case NOTIFICATION_JOBS.SEND_EMAIL:
        await this.email.send(job.data);
        break;
      case NOTIFICATION_JOBS.SEND_PUSH:
        await this.push.send(job.data);
        break;
      default:
        this.logger.warn(`Unknown notification job: ${job.name}`);
    }
  }
}
