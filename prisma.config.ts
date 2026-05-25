import { defineConfig } from 'prisma/config';

// Prisma CLI configuration (migrate, generate, studio, introspect).
// Runtime connection is handled by PrismaPg adapter in src/common/prisma/prisma.service.ts.
//
// DIRECT_DATABASE_URL bypasses PgBouncer so migrations can use advisory locks
// and CREATE INDEX CONCURRENTLY. For local Docker dev it equals DATABASE_URL.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL ?? '',
  },
});
