import { prisma } from '../src/lib/db';

async function testCategories() {
  console.log('=== TESTANDO CONTROLES DE CATEGORIAS SEM ROSTO ===');

  const docFilterSql = `
    "faceDescriptor" = 'NONE' AND "photoPath" IS NOT NULL AND (
      ("ocrText" IS NOT NULL AND "ocrText" ~* 'registro|geral|identidade|cpf|rg|nascimento|eleitor|carteira|certificado|uf|estado|republica|ministerio|filiacao|orgao|expedicao|sipe|penal|secretaria')
      OR "photoPath" ~* 'doc|rg|cpf|documento'
      OR "photoQuality" < 5
      OR "photoHash" IN (
        SELECT "photoHash" FROM apenados
        WHERE "faceDescriptor" = 'NONE' AND "photoHash" IS NOT NULL
        GROUP BY "photoHash"
        HAVING COUNT(*) >= 5
      )
    )
  `;

  const tattooFilterSql = `
    "faceDescriptor" = 'NONE' AND "photoPath" IS NOT NULL AND NOT (
      ("ocrText" IS NOT NULL AND "ocrText" ~* 'registro|geral|identidade|cpf|rg|nascimento|eleitor|carteira|certificado|uf|estado|republica|ministerio|filiacao|orgao|expedicao|sipe|penal|secretaria')
      OR "photoPath" ~* 'doc|rg|cpf|documento'
      OR "photoQuality" < 5
      OR "photoHash" IN (
        SELECT "photoHash" FROM apenados
        WHERE "faceDescriptor" = 'NONE' AND "photoHash" IS NOT NULL
        GROUP BY "photoHash"
        HAVING COUNT(*) >= 5
      )
    ) AND (
      "photoPath" ~* 'tatuagem|tattoo|tatoo|tatuag'
      OR EXISTS (
        SELECT 1 FROM sipe_fotos_complementares fc
        WHERE fc."apenadoLocalId" = apenados.id
          AND fc.descricao IS NOT NULL
          AND fc.descricao ~* 'tatuagem|tattoo|tatoo|tatuag|cicatriz'
      )
      -- Por exclusão: se não tem rosto, não é documento/placeholder, e tem qualidade regular de imagem,
      -- assumimos como provável tatuagem ou foto complementar de detalhe de corpo.
      OR ("photoQuality" >= 5 AND "ocrText" IS NULL)
    )
  `;

  const otherNoFaceFilterSql = `
    "faceDescriptor" = 'NONE' AND "photoPath" IS NOT NULL
    AND NOT (
      ("ocrText" IS NOT NULL AND "ocrText" ~* 'registro|geral|identidade|cpf|rg|nascimento|eleitor|carteira|certificado|uf|estado|republica|ministerio|filiacao|orgao|expedicao|sipe|penal|secretaria')
      OR "photoPath" ~* 'doc|rg|cpf|documento'
      OR "photoQuality" < 5
    )
    AND NOT (
      "photoPath" ~* 'tatuagem|tattoo|tatoo|tatuag'
      OR EXISTS (
        SELECT 1 FROM sipe_fotos_complementares fc
        WHERE fc."apenadoLocalId" = apenados.id
          AND fc.descricao IS NOT NULL
          AND fc.descricao ~* 'tatuagem|tattoo|tatoo|tatuag|cicatriz'
      )
    )
  `;

  try {
    const totalNoFace = await prisma.apenado.count({ where: { faceDescriptor: 'NONE' } });
    console.log(`Total Sem Rosto (NONE) no banco: ${totalNoFace}`);

    const resDoc = await prisma.$queryRawUnsafe<any[]>('SELECT COUNT(*) AS count FROM apenados WHERE ' + docFilterSql);
    const resTattoo = await prisma.$queryRawUnsafe<any[]>('SELECT COUNT(*) AS count FROM apenados WHERE ' + tattooFilterSql);
    const resOther = await prisma.$queryRawUnsafe<any[]>('SELECT COUNT(*) AS count FROM apenados WHERE ' + otherNoFaceFilterSql);

    console.log('resDoc raw:', resDoc);
    console.log('resTattoo raw:', resTattoo);
    console.log('resOther raw:', resOther);

  } catch (err: any) {
    console.error('Erro no teste de SQL:', err.message);
  }
}

testCategories().then(() => prisma.$disconnect());
