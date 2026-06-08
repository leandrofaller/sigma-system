import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('--- ANÁLISE DE HISTÓRICO DE INDEXAÇÃO ---');

  // Amostra de registros NONE no avançado
  const nones = await prisma.apenado.findMany({
    where: { faceDescriptorAdvanced: 'NONE' },
    select: { id: true, name: true, createdAt: true, updatedAt: true, photoPath: true, faceDescriptor: true },
    orderBy: { updatedAt: 'desc' },
    take: 5
  });

  console.log('\nAmostra de 5 apenados que deram NONE no avançado:');
  for (const n of nones) {
    const basicIsNone = n.faceDescriptor === 'NONE';
    const basicIsNull = n.faceDescriptor === null;
    const basicIsValid = !basicIsNone && !basicIsNull;
    console.log(`- Nome: ${n.name}`);
    console.log(`  ID: ${n.id}`);
    console.log(`  photoPath: ${n.photoPath}`);
    console.log(`  Criado: ${n.createdAt.toISOString()} | Atualizado: ${n.updatedAt.toISOString()}`);
    console.log(`  Básico (faceDescriptor) status: ${basicIsValid ? 'VÁLIDO' : (basicIsNone ? 'NONE' : 'NULL')}`);
  }

  // Verificando apenados com fotos recentes
  console.log('\nÚltimos 5 apenados atualizados no geral:');
  const recent = await prisma.apenado.findMany({
    orderBy: { updatedAt: 'desc' },
    select: { id: true, name: true, createdAt: true, updatedAt: true, photoPath: true, faceDescriptor: true, faceDescriptorAdvanced: true },
    take: 5
  });

  for (const r of recent) {
    console.log(`- Nome: ${r.name}`);
    console.log(`  ID: ${r.id}`);
    console.log(`  photoPath: ${r.photoPath}`);
    console.log(`  Criado: ${r.createdAt.toISOString()} | Atualizado: ${r.updatedAt.toISOString()}`);
    console.log(`  Básico: ${r.faceDescriptor ? (r.faceDescriptor === 'NONE' ? 'NONE' : 'VÁLIDO') : 'NULL'}`);
    console.log(`  Avançado: ${r.faceDescriptorAdvanced ? (r.faceDescriptorAdvanced === 'NONE' ? 'NONE' : 'VÁLIDO') : 'NULL'}`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
