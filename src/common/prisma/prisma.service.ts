import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaClient, Prisma } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      log:
        process.env.NODE_ENV === 'development'
          ? [
              { emit: 'event', level: 'query' },
              { emit: 'event', level: 'warn' },
              { emit: 'event', level: 'error' },
            ]
          : [{ emit: 'event', level: 'error' }],
    });
  }

  async onModuleInit() {
    await this.$connect();
    this.logger.log('✅ Connected to PostgreSQL');

    if (process.env.NODE_ENV === 'development') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (this as any).$on('query', (e: Prisma.QueryEvent) => {
        if (e.duration > 100) {
          this.logger.warn(`Slow query (${e.duration}ms): ${e.query}`);
        }
      });
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
    this.logger.log('🔌 Disconnected from PostgreSQL');
  }

  /**
   * Run a callback inside an interactive transaction.
   * Use this for any operation that touches the ledger or multiple wallets.
   *
   * Default isolation is Serializable: the safest option for money movement,
   * preventing the lost-update and write-skew anomalies that lose customer funds.
   */
  async runInTransaction<T>(
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
    options?: {
      isolationLevel?: Prisma.TransactionIsolationLevel;
      maxWait?: number;
      timeout?: number;
    },
  ): Promise<T> {
    return this.$transaction(fn, {
      isolationLevel:
        options?.isolationLevel ?? Prisma.TransactionIsolationLevel.Serializable,
      maxWait: options?.maxWait ?? 5_000,
      timeout: options?.timeout ?? 15_000,
    });
  }
}
