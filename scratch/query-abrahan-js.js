const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    const apenados = await prisma.sipeApenadoImportado.findMany({
      where: {
        nome: { contains: 'ABRAHAN' }
      }
    });
    
    if (apenados.length === 0) {
      console.log('Nenhum apenado com o nome contendo "ABRAHAN" encontrado no banco.');
      return;
    }

    console.log(`Encontrados ${apenados.length} apenados contendo "ABRAHAN":`);
    for (const apenado of apenados) {
      console.log(JSON.stringify({
        id: apenado.id,
        sipeId: apenado.sipeId,
        nome: apenado.nome,
        unidade: apenado.unidade,
        cela: apenado.cela
      }, null, 2));

      const historicos = await prisma.sipeHistorico.findMany({
        where: {
          apenadoId: apenado.id
        },
        orderBy: {
          datahora: 'desc'
        }
      });

      console.log(`Históricos encontrados para ${apenado.nome} (${historicos.length}):`);
      historicos.forEach((h) => {
        console.log(JSON.stringify({
          id: h.id,
          tipo: h.tipo,
          datahora: h.datahora,
          unidade: h.unidade,
          cela: h.cela,
          descricao: h.descricao
        }, null, 2));
      });
      console.log('--------------------------------------------------');
    }

  } catch (err) {
    console.error(err);
  } finally {
    await prisma.$disconnect();
  }
}

main();
