import { prisma } from '../src/lib/db';

async function main() {
  console.log('🛠️ Iniciando correção para "ABNER DE SOUZA SILVA"...');

  // IDs identificados no diagnóstico anterior
  const keepId = 'cmpeoyifh007710j8tgmv3eze'; // Registro com melhor score de qualidade
  const deleteIds = ['cmpeoyi0b007310j84409mro7', 'cmpeoyifi007b10j8mpu9v8hl'];
  const sipeId = 61728;

  // 1. Renomeia o apenado principal (remove o "(3)" que é adicionado a duplicatas)
  console.log(`- Atualizando nome e photoPath do apenado local principal (${keepId})...`);
  await prisma.apenado.update({
    where: { id: keepId },
    data: {
      name: 'ABNER DE SOUZA SILVA',
      photoPath: `uploads/apenados/sipe-${sipeId}.webp`
    }
  });

  // 2. Vincula a importação SIPE de ID 61728 ao apenado principal local
  console.log(`- Vinculando a importação do SIPE ID ${sipeId} ao apenado local principal...`);
  await prisma.sipeApenadoImportado.update({
    where: { sipeId: sipeId },
    data: {
      apenadoLocalId: keepId
    }
  });

  // 3. Remove os registros de apenados locais duplicados órfãos
  console.log(`- Removendo as duplicatas locais órfãs...`);
  const delResult = await prisma.apenado.deleteMany({
    where: {
      id: { in: deleteIds }
    }
  });
  console.log(`  └─ Deletados ${delResult.count} registro(s) duplicado(s).`);

  console.log('\n✅ Correção de banco finalizada com sucesso!');
  console.log('💡 Agora o sistema sabe que o apenado local corresponde ao SIPE ID 61728 e que a foto dele deve ser uploads/apenados/sipe-61728.webp.');
  console.log('💡 Ao rodar o "Recuperar Fotos Ausentes" ou a sincronização manual do ID 61728 no painel, o sistema irá baixar a foto dele normalmente.');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
