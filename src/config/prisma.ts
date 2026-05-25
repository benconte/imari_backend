import { Prisma } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

// ─── Slow-query threshold ───────────────────────────────────────────────────
// Queries slower than this (ms) are logged as WARN in development.
export const SLOW_QUERY_THRESHOLD_MS = 100;

// ─── Runtime PrismaClient options ───────────────────────────────────────────
// Production: only error events (avoid leaking query details in logs)
// Development: query + warn + error, with slow-query detection
export const prismaClientOptions: Omit<Prisma.PrismaClientOptions, 'adapter'> = {
  log:
    process.env.NODE_ENV === 'production'
      ? [{ emit: 'event', level: 'error' }]
      : [
          { emit: 'event', level: 'query' },
          { emit: 'event', level: 'warn' },
          { emit: 'event', level: 'error' },
        ],

  // "pretty" shows coloured output in local terminals; "minimal" reduces log
  // volume on production aggregators (Datadog, CloudWatch, etc.)
  errorFormat: process.env.NODE_ENV === 'production' ? 'minimal' : 'pretty',
};

// ─── PrismaPg adapter factory ────────────────────────────────────────────────
// Prisma 7 requires a driver adapter instead of embedding the URL in the schema.
// DATABASE_URL is used at runtime (may go through a PgBouncer pooler in prod).
// The pool is created once per PrismaClient instance.
export function createPrismaAdapter(): PrismaPg {
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });
  return new PrismaPg(pool);
}
