import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function check() {
  console.log('Buscando últimos apenados sincronizados...');
  const apenados = await prisma.sipeApenadoImportado.findMany({
    orderBy: { ultimaSyncAt: 'desc' },
    take: 10,
    select: {
      sipeId: true,
      nome: true,
      unidade: true,
      cela: true,
      situacao: true,
      ultimaSyncAt: true
    }
  });

  console.log('Últimos 10 apenados sincronizados:');
  console.log(JSON.stringify(apenados, null, 2));
}

check().catch(console.error).finally(() => prisma.$disconnect());
