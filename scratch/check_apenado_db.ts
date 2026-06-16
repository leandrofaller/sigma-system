import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function check() {
  const sipeId = 37894;
  console.log(`Buscando apenado sipeId=${sipeId} no banco de dados local...`);
  
  const apenado = await prisma.sipeApenadoImportado.findUnique({
    where: { sipeId },
    include: {
      faccao: true,
      alcunhas: true,
    }
  });
  
  if (!apenado) {
    console.log('Apenado não encontrado no banco local!');
    return;
  }
  
  console.log('Dados do Apenado no banco:');
  console.log(JSON.stringify(apenado, null, 2));
}

check().catch(console.error).finally(() => prisma.$disconnect());
