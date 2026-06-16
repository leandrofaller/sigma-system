import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function check() {
  console.log('Buscando apenado MANOEL CRISTIANE...');
  const apenados = await prisma.sipeApenadoImportado.findMany({
    where: {
      nome: {
        contains: 'MANOEL CRISTIANE'
      }
    },
    include: {
      faccao: true
    }
  });

  console.log('Resultados encontrados:');
  console.log(JSON.stringify(apenados, null, 2));
}

check().catch(console.error).finally(() => prisma.$disconnect());
