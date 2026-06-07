import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const countNotNull = await prisma.apenado.count({
    where: { faceDescriptorAdvanced: { not: null } }
  });
  console.log('Total not null:', countNotNull);

  const samples = await prisma.apenado.findMany({
    where: { faceDescriptorAdvanced: { not: null } },
    select: { id: true, name: true, faceDescriptorAdvanced: true, advancedDetScore: true },
    take: 10
  });

  console.log('Samples:');
  console.log(JSON.stringify(samples, null, 2));

  const noneCount = await prisma.apenado.count({
    where: { faceDescriptorAdvanced: 'NONE' }
  });
  console.log('Total NONE:', noneCount);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
