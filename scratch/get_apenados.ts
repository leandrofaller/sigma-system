import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const records = await prisma.apenado.findMany({
    where: { photoPath: { not: null } },
    select: { id: true, name: true, photoPath: true },
    take: 5
  });
  console.log(JSON.stringify(records, null, 2));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
