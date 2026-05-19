import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const total = await prisma.apenado.count();
  console.log(`Total de apenados no banco: ${total}`);

  if (total === 0) {
    console.log('Nenhum registro para deletar.');
    return;
  }

  console.log(`Deletando ${total} registros...`);
  const result = await prisma.apenado.deleteMany({});
  console.log(`✅ Deletados: ${result.count} registros.`);

  const remaining = await prisma.apenado.count();
  console.log(`Registros restantes: ${remaining}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
