import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import { EMAIL_JOBS, EMAIL_QUEUE } from './email.constants';

export interface SendOtpPayload {
  to: string;
  firstName: string;
  otp: string;
  purpose: 'EMAIL_VERIFY' | 'RESET_PASSWORD';
}

export interface SendNotificationPayload {
  to: string;
  firstName: string;
  subject: string;
  templateName: string;
  templateData: Record<string, any>;
}

@Injectable()
export class EmailService {
  constructor(@InjectQueue(EMAIL_QUEUE) private readonly queue: Queue) {}

  async sendOtp(payload: SendOtpPayload): Promise<void> {
    await this.queue.add(EMAIL_JOBS.SEND_OTP, payload, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: true,
      removeOnFail: 100,
    });
  }

  async sendNotification(payload: SendNotificationPayload): Promise<void> {
    await this.queue.add(EMAIL_JOBS.SEND_NOTIFICATION, payload, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: true,
      removeOnFail: 100,
    });
  }
}
