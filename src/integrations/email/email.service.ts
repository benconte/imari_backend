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
}
