import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Seed a default super-admin (change credentials immediately after first login)
  const adminEmail = 'admin@imari.local';
  const adminPassword = 'ChangeMe123!';

  const existing = await prisma.adminUser.findUnique({ where: { email: adminEmail } });
  if (!existing) {
    const passwordHash = await argon2.hash(adminPassword, { type: argon2.argon2id });
    await prisma.adminUser.create({
      data: {
        email: adminEmail,
        passwordHash,
        firstName: 'Imari',
        lastName: 'Admin',
        role: 'SUPER_ADMIN',
        permissions: ['*'],
        isActive: true,
      },
    });
    console.log(`✅ Created default admin: ${adminEmail} / ${adminPassword}`);
    console.log('   ⚠️  CHANGE THIS PASSWORD AFTER FIRST LOGIN.');
  } else {
    console.log(`ℹ️  Admin already exists: ${adminEmail}`);
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
