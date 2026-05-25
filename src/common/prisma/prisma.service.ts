import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaClient, Prisma } from '@prisma/client';
import {
  createPrismaAdapter,
  prismaClientOptions,
  SLOW_QUERY_THRESHOLD_MS,
} from '@config/prisma';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({ ...prismaClientOptions, adapter: createPrismaAdapter() });
  }

  async onModuleInit() {
    await this.$connect();
    this.logger.log('Connected to PostgreSQL');

    if (process.env.NODE_ENV !== 'production') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (this as any).$on('query', (e: Prisma.QueryEvent) => {
        if (e.duration > SLOW_QUERY_THRESHOLD_MS) {
          this.logger.warn(`Slow query (${e.duration}ms): ${e.query}`);
        }
      });
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  /**
   * Run a callback inside a serializable transaction.
   * Required for all ledger and wallet operations to prevent lost-updates.
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
