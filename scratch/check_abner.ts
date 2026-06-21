import { prisma } from '../src/lib/db';
import { getApenadoPhotoPath } from '../src/lib/storage';
import fs from 'fs/promises';

async function main() {
  console.log('🔍 Buscando o apenado "ABNER DE SOUZA SILVA"...');
  
  // Busca na tabela Apenado local
  const apenadosLocais = await prisma.apenado.findMany({
    where: {
      name: {
        contains: 'ABNER DE SOUZA SILVA',
        mode: 'insensitive'
      }
    },
    include: {
      sipeImportacoes: true
    }
  });

  console.log(`\n📊 Encontrados ${apenadosLocais.length} registro(s) local(is) na tabela Apenado:`);
  for (const a of apenadosLocais) {
    console.log(`\n📌 Registro Local ID: ${a.id}`);
    console.log(`- Nome: ${a.name}`);
    console.log(`- Matrícula/RJI: ${a.matricula}`);
    console.log(`- photoPath: ${a.photoPath}`);
    console.log(`- photoHashSha: ${a.photoHashSha}`);
    console.log(`- photoQuality: ${a.photoQuality}`);
    if (a.photoPath) {
      const filePath = getApenadoPhotoPath(a.photoPath);
      console.log(`- Caminho Físico Resolvido: ${filePath}`);
      try {
        await fs.access(filePath);
        console.log('  ✅ Arquivo de foto EXISTE localmente!');
      } catch {
        console.log('  ❌ Arquivo de foto NÃO existe localmente.');
      }
    }
    console.log(`- Importações SIPE vinculadas: ${a.sipeImportacoes.length}`);
    for (const imp of a.sipeImportacoes) {
      console.log(`  └─ SIPE ID: ${imp.sipeId} | Nome: ${imp.nome} | photoPath SIPE: ${imp.photoPath}`);
    }
  }

  // Busca na tabela SipeApenadoImportado independente (caso não esteja vinculado ao Apenado local)
  const importacoesSipe = await prisma.sipeApenadoImportado.findMany({
    where: {
      nome: {
        contains: 'ABNER DE SOUZA SILVA',
        mode: 'insensitive'
      }
    }
  });

  console.log(`\n📊 Encontrados ${importacoesSipe.length} registro(s) na tabela SipeApenadoImportado (SIPE puro):`);
  for (const imp of importacoesSipe) {
    console.log(`\n📌 Registro SIPE ID: ${imp.sipeId}`);
    console.log(`- Nome: ${imp.nome}`);
    console.log(`- RJI: ${imp.rji}`);
    console.log(`- CPF: ${imp.cpf}`);
    console.log(`- photoPath SIPE: ${imp.photoPath}`);
    console.log(`- Vinculado ao Apenado local ID: ${imp.apenadoLocalId}`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
