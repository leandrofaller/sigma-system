import { config } from 'dotenv';
config();
config({ path: '.env.local' });

import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  console.log('--- Buscando SipeApenadoImportado ---');
  const imports = await prisma.sipeApenadoImportado.findMany({
    where: {
      nome: { contains: 'ABDON LIMA', mode: 'insensitive' }
    },
    include: {
      apenado: true
    }
  });
  console.log(JSON.stringify(imports, null, 2));

  console.log('--- Buscando Apenado local ---');
  const locals = await prisma.apenado.findMany({
    where: {
      name: { contains: 'ABDON LIMA', mode: 'insensitive' }
    }
  });
  console.log(JSON.stringify(locals, null, 2));
}

main()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());
