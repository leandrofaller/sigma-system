import { prisma } from '../src/lib/db';

async function testQuery() {
  console.log('=== TESTANDO PERFORMANCE DA QUERY DE CACHE ===');
  
  // Teste 1: Query original com encode e strpos
  console.log('\nQuery 1 (Original com encode e strpos):');
  const start1 = Date.now();
  try {
    const batch1 = await prisma.$queryRaw<any[]>`
      SELECT
        encode(id::bytea, 'hex') AS id,
        "faceDescriptor"          AS fd
      FROM apenados
      WHERE "faceDescriptor" IS NOT NULL
        AND "faceDescriptor" LIKE '[%'
        AND "photoPath" IS NOT NULL
        AND strpos(encode("faceDescriptor"::bytea, 'hex'), '00') = 0
        AND id > ''
      ORDER BY id
      LIMIT 1000
    `;
    console.log(`Lote de 1000 registros retornado com sucesso.`);
    console.log(`Tempo gasto: ${Date.now() - start1} ms`);
  } catch (e: any) {
    console.error('Erro na Query 1:', e.message);
  }

  // Teste 2: Query otimizada (sem encode e sem strpos)
  console.log('\nQuery 2 (Otimizada sem encode e sem strpos):');
  const start2 = Date.now();
  try {
    const batch2 = await prisma.$queryRaw<any[]>`
      SELECT
        id,
        "faceDescriptor" AS fd
      FROM apenados
      WHERE "faceDescriptor" IS NOT NULL
        AND "faceDescriptor" LIKE '[%'
        AND "photoPath" IS NOT NULL
        AND id > ''
      ORDER BY id
      LIMIT 1000
    `;
    console.log(`Lote de 1000 registros retornado com sucesso.`);
    console.log(`Tempo gasto: ${Date.now() - start2} ms`);
  } catch (e: any) {
    console.error('Erro na Query 2:', e.message);
  }
}

testQuery().then(() => prisma.$disconnect());
