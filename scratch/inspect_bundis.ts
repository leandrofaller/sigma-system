import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function run() {
  const id = 'cmpeq11qd0shp10j811jx7dkj';
  console.log(`Buscando apenado com ID = ${id} de forma detalhada...\n`);

  const apenado = await prisma.apenado.findUnique({
    where: { id },
    include: {
      sipeImportacoes: true,
      groups: {
        include: {
          group: true
        }
      },
      createdBy: true
    }
  });

  if (!apenado) {
    console.log('Apenado não encontrado!');
    return;
  }

  console.log('=== DETALHES DO APENADO ===');
  console.log(`ID: ${apenado.id}`);
  console.log(`Nome: ${apenado.name}`);
  console.log(`Matrícula: ${apenado.matricula}`);
  console.log(`Unidade: ${apenado.unidade}`);
  console.log(`Facção: ${apenado.faccao}`);
  console.log(`Foto Path: ${apenado.photoPath}`);
  console.log(`Score Detecção: ${apenado.detScore}`);
  console.log(`Qualidade Foto: ${apenado.photoQuality}`);
  console.log(`Notas: ${apenado.notes}`);
  console.log(`Criado em: ${apenado.createdAt}`);
  console.log(`Criado por: ${apenado.createdBy?.name} (${apenado.createdBy?.email})`);

  console.log('\n=== IMPORTAÇÕES SIPE VINCULADAS ===');
  console.log(`Total: ${apenado.sipeImportacoes.length}`);
  for (const imp of apenado.sipeImportacoes) {
    console.log(`- SipeID: ${imp.sipeId}, Nome: ${imp.nome}, CPF: ${imp.cpf}, RG: ${imp.rg}, Situação: ${imp.situacao}, Unidade: ${imp.unidade}`);
  }

  console.log('\n=== GRUPOS VINCULADOS ===');
  console.log(`Total: ${apenado.groups.length}`);
  for (const g of apenado.groups) {
    console.log(`- Grupo: ${g.group.name} (Similiaridade: ${g.similarity})`);
  }
}

run().catch(console.error).finally(() => prisma.$disconnect());
