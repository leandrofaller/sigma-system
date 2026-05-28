const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const apenados = await prisma.sipeApenadoImportado.findMany({
    take: 10,
    select: {
      sipeId: true,
      nome: true,
      unidade: true,
      cela: true
    }
  });

  console.log(`Amostra de apenados no banco:`);
  console.log(JSON.stringify(apenados, null, 2));

  // Agrupar por unidade para ver a distribuição
  const dist = await prisma.sipeApenadoImportado.groupBy({
    by: ['unidade'],
    _count: {
      _all: true
    }
  });
  console.log(`\nDistribuição por unidade:`);
  console.log(JSON.stringify(dist, null, 2));
}

main()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());
