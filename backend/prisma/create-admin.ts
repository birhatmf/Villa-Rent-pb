import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  const name = process.env.ADMIN_NAME?.trim() || 'Yönetici';

  if (!email || !password) {
    throw new Error('ADMIN_EMAIL ve ADMIN_PASSWORD tanımlanmalıdır.');
  }
  if (password.length < 12) {
    throw new Error('ADMIN_PASSWORD en az 12 karakter olmalıdır.');
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    if (existing.role !== 'ADMIN') {
      throw new Error('Bu e-posta başka bir role ait; hesap değiştirilmedi.');
    }
    console.log(`Admin hesabı zaten var: ${email}`);
    return;
  }

  await prisma.user.create({
    data: {
      email,
      name,
      role: 'ADMIN',
      active: true,
      passwordHash: await bcrypt.hash(password, 12),
    },
  });
  console.log(`Admin hesabı oluşturuldu: ${email}`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
