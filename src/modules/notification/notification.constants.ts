export const NOTIFICATION_QUEUE = 'notifications';

export const NOTIFICATION_JOBS = {
  SEND_IN_APP: 'send-in-app',
  SEND_PUSH: 'send-push',
  SEND_EMAIL: 'send-email',
} as const;

// Notification types eligible for email digest batching instead of immediate delivery
export const DIGEST_ELIGIBLE_TYPES = new Set([
  'PROMOTIONAL',
  'FINANCIAL_INSIGHT',
  'SUBSCRIPTION_REMINDER',
  'BUDGET_ALERT',
]);

export const JOB_OPTIONS = {
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 2000 },
  removeOnComplete: true,
  removeOnFail: 50,
} as const;

export interface NotificationJobPayload {
  userId: string;
  type: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  actionUrl?: string;
}
