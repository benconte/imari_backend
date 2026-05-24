import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job } from 'bullmq';
import * as nodemailer from 'nodemailer';
import { EMAIL_JOBS, EMAIL_QUEUE } from './email.constants';
import { SendOtpPayload } from './email.service';

@Processor(EMAIL_QUEUE)
export class EmailProcessor extends WorkerHost {
  private readonly logger = new Logger(EmailProcessor.name);
  private readonly transporter: nodemailer.Transporter;

  constructor(private readonly config: ConfigService) {
    super();
    this.transporter = nodemailer.createTransport({
      host: this.config.get<string>('mail.host', 'localhost'),
      port: this.config.get<number>('mail.port', 1025),
      secure: false,
    });
  }

  async process(job: Job): Promise<void> {
    switch (job.name) {
      case EMAIL_JOBS.SEND_OTP:
        await this.handleSendOtp(job.data as SendOtpPayload);
        break;
      default:
        this.logger.warn(`Unknown email job: ${job.name}`);
    }
  }

  private async handleSendOtp(payload: SendOtpPayload): Promise<void> {
    const config = {
      EMAIL_VERIFY: {
        subject: 'Verify your Imari email address',
        heading: 'Email Verification',
        body: 'Use the code below to verify your email address. It expires in 10 minutes.',
      },
      RESET_PASSWORD: {
        subject: 'Reset your Imari password',
        heading: 'Password Reset',
        body: 'Use the code below to reset your password. It expires in 30 minutes.',
      },
    }[payload.purpose];

    await this.transporter.sendMail({
      from: this.config.get<string>('mail.from', 'Imari <no-reply@imari.local>'),
      to: payload.to,
      subject: config.subject,
      html: this.buildHtml(payload.firstName, config.heading, config.body, payload.otp),
    });

    this.logger.log(`OTP email sent → ${payload.to} [${payload.purpose}]`);
  }

  private buildHtml(name: string, heading: string, body: string, otp: string): string {
    return `<!DOCTYPE html><html><body style="font-family:sans-serif;background:#f5f7fa;padding:40px 0">
      <div style="max-width:480px;margin:auto;background:#fff;border-radius:12px;padding:40px;box-shadow:0 2px 8px rgba(0,0,0,.08)">
        <h2 style="color:#111;margin-top:0">${heading}</h2>
        <p style="color:#444">Hi ${name},</p>
        <p style="color:#444">${body}</p>
        <div style="text-align:center;padding:28px 0">
          <span style="font-size:42px;font-weight:700;letter-spacing:12px;color:#2563eb;font-variant-numeric:tabular-nums">${otp}</span>
        </div>
        <p style="color:#888;font-size:13px">Never share this code. Imari staff will never ask for it.</p>
        <hr style="border:none;border-top:1px solid #eee;margin:24px 0">
        <p style="color:#bbb;font-size:12px;text-align:center">Imari — Intelligent Digital Banking</p>
      </div>
    </body></html>`;
  }
}
