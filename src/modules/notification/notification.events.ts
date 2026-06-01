export const NOTIFICATION_EVENTS = {
  TRANSACTION_COMPLETED: 'transaction.completed',
  SECURITY_EVENT: 'security.event',
  BUDGET_ALERT: 'budget.alert',
  SAVINGS_GOAL_REACHED: 'savings.goal.reached',
  SUBSCRIPTION_REMINDER: 'subscription.reminder',
} as const;

export interface TransactionCompletedEvent {
  transactionId: string;
  reference: string;
  senderId: string | null;
  senderName: string | null;
  receiverId: string | null;
  receiverName: string | null;
  amount: string;
  currency: string;
  type: 'P2P_TRANSFER' | 'DEPOSIT' | 'WITHDRAWAL';
  description: string;
  processedAt: Date;
}

export interface SecurityEvent {
  userId: string;
  eventType: 'PASSWORD_CHANGED' | 'MFA_ENABLED' | 'MFA_DISABLED' | 'NEW_LOGIN';
  ipAddress?: string;
  userAgent?: string;
  timestamp: Date;
}

export interface BudgetAlertEvent {
  userId: string;
  categoryName: string;
  spent: string;
  limit: string;
  percentUsed: number;
  currency: string;
}

export interface SavingsGoalReachedEvent {
  userId: string;
  vaultName: string;
  targetAmount: string;
  currency: string;
}

export interface SubscriptionReminderEvent {
  userId: string;
  subscriptionName: string;
  amount: string;
  currency: string;
  nextBillingDate: Date;
}
