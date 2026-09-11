import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const requiredColumns = [
    ['User', 'isPrimaryAdmin'],
    ['Booking', 'guestAccessVersion'],
  ] as const;
  const requiredConstraints = [
    'Booking_no_active_overlap',
    'Booking_valid_range',
    'Booking_prepayment_range',
    'HostApplication_one_active_per_user',
  ];

  const missingColumns: string[] = [];
  for (const [table, column] of requiredColumns) {
    const rows = await prisma.$queryRaw<{ exists: boolean }[]>`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = ${table} AND column_name = ${column}
      ) AS exists
    `;
    if (!rows[0]?.exists) missingColumns.push(`${table}.${column}`);
  }

  const constraints = await prisma.$queryRaw<{ conname: string }[]>`
    SELECT conname FROM pg_constraint
    WHERE conname = ANY(${requiredConstraints})
  `;
  const present = new Set(constraints.map(({ conname }) => conname));
  const missingConstraints = requiredConstraints.filter((name) => !present.has(name));
  if (missingColumns.length || missingConstraints.length) {
    throw new Error(
      `Güvenlik şeması eksik. Sütunlar: ${missingColumns.join(', ') || 'yok'}; ` +
        `constraint'ler: ${missingConstraints.join(', ') || 'yok'}`,
    );
  }
  console.log('security-schema: required columns and constraints present');
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
