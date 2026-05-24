# Imari Backend

Intelligent Digital Banking & Financial Lifestyle Platform — NestJS backend.

## Stack

- **Runtime:** Node.js 20+, TypeScript 5
- **Framework:** NestJS 10
- **Database:** PostgreSQL 16
- **ORM:** Prisma 5
- **Queue:** BullMQ on Redis 7
- **Auth:** JWT (access + refresh) + Argon2id + TOTP MFA
- **Payments:** Flutterwave
- **Notifications:** Email (Nodemailer) + In-App (WebSocket) + Push (FCM)

## Prerequisites

- Node.js >= 20 (`node --version`)
- Docker + Docker Compose (`docker --version`)
- npm

## Quick start

```bash
# 1. Copy and configure environment
cp .env.example .env
```

Then **generate real secrets** and paste them into `.env`:

```bash
# ENCRYPTION_KEY (run once):
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# JWT_ACCESS_SECRET (run once):
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"

# JWT_REFRESH_SECRET (run once — must be different from access secret):
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

The app refuses to boot if these are missing or malformed — that's intentional.

```bash
# 2. Install dependencies
npm install

# 3. Start infrastructure (Postgres + Redis + MailHog)
npm run db:up

# 4. Apply migrations + generate Prisma client
npm run prisma:migrate

# 5. Seed default admin
npm run prisma:seed

# 6. Start the dev server
npm run start:dev
```

You should see:

```
[Nest] LOG [PrismaService] ✅ Connected to PostgreSQL
[Nest] LOG [Bootstrap] 🚀 Imari API running at http://localhost:3000/api/v1
[Nest] LOG [Bootstrap] 📘 Swagger UI    at http://localhost:3000/api/v1/docs
```

## Verify it's working

```bash
curl http://localhost:3000/api/v1/health
```

Expected:

```json
{
  "success": true,
  "statusCode": 200,
  "data": {
    "status": "ok",
    "services": { "database": "up" },
    "uptime": 4.123,
    "timestamp": "..."
  },
  "timestamp": "..."
}
```

## Useful URLs (dev)

| Service | URL |
| --- | --- |
| API | http://localhost:3000/api/v1 |
| Swagger | http://localhost:3000/api/v1/docs |
| MailHog (sent emails) | http://localhost:8025 |
| Prisma Studio | http://localhost:5555 (`npm run prisma:studio`) |

## Scripts

| Command | What it does |
| --- | --- |
| `npm run start:dev` | Watch-mode dev server |
| `npm run db:up` | Start Postgres + Redis + MailHog |
| `npm run db:down` | Stop infrastructure |
| `npm run prisma:migrate` | Create + run a new migration |
| `npm run prisma:studio` | Open Prisma Studio |
| `npm run prisma:reset` | Wipe DB and re-migrate (DEV ONLY) |
| `npm run prisma:seed` | Seed initial data |
| `npm run build` | Compile to `dist/` |
| `npm test` | Run unit tests |

## What's wired up so far

- ✅ NestJS bootstrap with helmet, CORS, compression, cookies
- ✅ Global Zod env validation (app fails fast on misconfig)
- ✅ Global validation pipe, exception filters, response transformer, request logger
- ✅ PrismaService with Serializable transaction helper (for ledger work)
- ✅ Throttler (rate limiting)
- ✅ EventEmitter (for cross-module events)
- ✅ Scheduler (for cron jobs)
- ✅ Swagger
- ✅ Health endpoint (`GET /api/v1/health`)
- ✅ Path aliases: `@/`, `@common/`, `@config/`, `@modules/`
- ✅ Utility helpers: money math, hashing (argon2 + sha256), AES-256-GCM encryption, references

## What's next (Sprint 1 — Auth)

Build out `src/modules/auth/` per the roadmap. The folder structure document lists every file. The order is:

1. `auth.module.ts`, `auth.service.ts`, `auth.controller.ts`
2. JWT strategies (`jwt.strategy.ts`, `jwt-refresh.strategy.ts`)
3. `otp.service.ts` (email-only OTP delivery)
4. `session.service.ts` (refresh token rotation, hashed storage)
5. `mfa.service.ts` (TOTP + backup codes)
6. Register the module in `app.module.ts`

After Auth: Identity → Wallet → Ledger → Transactions.

## Path aliases

Use these everywhere instead of `../../../`:

```typescript
import { PrismaService } from '@common/prisma/prisma.service';
import { configuration } from '@config/configuration';
import { AuthModule } from '@modules/auth/auth.module';
```
