import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import * as argon2 from 'argon2';

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('🌱 Seeding database...');

 const admins = [
  {
    email: 'superadmin@imari.com',
    firstName: 'Super',
    lastName: 'Admin',
    role: 'SUPER_ADMIN',
    permissions: ['*'],
  },
  {
    email: 'financial@imari.com',
    firstName: 'Financial',
    lastName: 'Officer',
    role: 'OPS_ADMIN',
    permissions: ['finance:*'],
  },
  {
    email: 'fraud@imari.com',
    firstName: 'Fraud',
    lastName: 'Officer',
    role: 'FRAUD_OFFICER',
    permissions: ['fraud:*'],
  },
  {
    email: 'support@imari.com',
    firstName: 'Support',
    lastName: 'Agent',
    role: 'SUPPORT',
    permissions: ['support:*'],
  },
];

const defaultPassword = 'password123';
const passwordHash = await argon2.hash(defaultPassword, {
  type: argon2.argon2id,
});

for (const admin of admins) {
  const existing = await prisma.adminUser.findUnique({
    where: { email: admin.email },
  });

  if (!existing) {
    await prisma.adminUser.create({
      data: {
        email: admin.email,
        passwordHash,
        firstName: admin.firstName,
        lastName: admin.lastName,
        role: admin.role as any,
        permissions: admin.permissions,
        isActive: true,
      },
    });

    console.log(
      `✅ Created ${admin.role}: ${admin.email} / ${defaultPassword}`,
    );
  } else {
    console.log(`ℹ️ Admin already exists: ${admin.email}`);
  }
}

  console.log('✅ Seed complete.');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
