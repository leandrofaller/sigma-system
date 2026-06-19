import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';

const TAKE_MAX = 100;

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const user = session.user as any;
  if (user.role !== 'SUPER_ADMIN' && user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
  }

  const sp = req.nextUrl.searchParams;
  const tab = (sp.get('tab') || 'lowscore') as 'lowscore' | 'blurry' | 'pending' | 'noface' | 'noface_doc' | 'noface_tattoo';
  const skip = Math.max(0, parseInt(sp.get('skip') || '0', 10));
  const take = Math.min(TAKE_MAX, Math.max(1, parseInt(sp.get('take') || '50', 10)));

  // SQL queries heurísticas para triagem de imagens sem rosto (faceDescriptor = 'NONE')
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
    )
  `;

  const otherNoFaceFilterSql = `
    "faceDescriptor" = 'NONE' AND "photoPath" IS NOT NULL
    AND NOT (
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

  // Stats em paralelo — cada contagem usa o mesmo padrão de filtro
  const [total, indexed, lowScore, blurry, pending, countDoc, countTattoo, countOther] = await Promise.all([
    prisma.apenado.count({ where: { photoPath: { not: null } } }),
    prisma.apenado.count({ where: { faceDescriptor: { startsWith: '[' } } }),
    prisma.apenado.count({
      where: { faceDescriptor: { startsWith: '[' }, detScore: { lt: 0.5 } },
    }),
    prisma.apenado.count({
      where: {
        faceDescriptor: { startsWith: '[' },
        photoQuality: { lt: 50 },
      },
    }),
    prisma.apenado.count({
      where: { faceDescriptor: null, photoPath: { not: null } },
    }),
    prisma.$queryRawUnsafe<[{ count: string }]>('SELECT COUNT(*) AS count FROM apenados WHERE ' + docFilterSql).then(r => Number(r[0]?.count ?? 0)),
    prisma.$queryRawUnsafe<[{ count: string }]>('SELECT COUNT(*) AS count FROM apenados WHERE ' + tattooFilterSql).then(r => Number(r[0]?.count ?? 0)),
    prisma.$queryRawUnsafe<[{ count: string }]>('SELECT COUNT(*) AS count FROM apenados WHERE ' + otherNoFaceFilterSql).then(r => Number(r[0]?.count ?? 0)),
  ]);

  // Consulta paginada conforme a aba
  const select = {
    id: true,
    name: true,
    matricula: true,
    unidade: true,
    photoPath: true,
    photoQuality: true,
    detScore: true,
  };

  let records: any[];
  let tabTotal: number;

  if (tab === 'lowscore') {
    const where = { faceDescriptor: { startsWith: '[' }, detScore: { lt: 0.5 } };
    [records, tabTotal] = await Promise.all([
      prisma.apenado.findMany({ where, select, skip, take, orderBy: { detScore: 'asc' } }),
      prisma.apenado.count({ where }),
    ]);
  } else if (tab === 'blurry') {
    const where = { faceDescriptor: { startsWith: '[' }, photoQuality: { lt: 50 } };
    [records, tabTotal] = await Promise.all([
      prisma.apenado.findMany({ where, select, skip, take, orderBy: { photoQuality: 'asc' } }),
      prisma.apenado.count({ where }),
    ]);
  } else if (tab === 'noface_doc') {
    [records, tabTotal] = await Promise.all([
      prisma.$queryRawUnsafe<any[]>(
        `SELECT id, name, matricula, unidade, "photoPath", "photoQuality", "detScore" 
         FROM apenados 
         WHERE ${docFilterSql} 
         ORDER BY "photoQuality" DESC 
         LIMIT ${take} OFFSET ${skip}`
      ),
      Promise.resolve(countDoc),
    ]);
  } else if (tab === 'noface_tattoo') {
    [records, tabTotal] = await Promise.all([
      prisma.$queryRawUnsafe<any[]>(
        `SELECT id, name, matricula, unidade, "photoPath", "photoQuality", "detScore" 
         FROM apenados 
         WHERE ${tattooFilterSql} 
         ORDER BY "photoQuality" DESC 
         LIMIT ${take} OFFSET ${skip}`
      ),
      Promise.resolve(countTattoo),
    ]);
  } else if (tab === 'noface') {
    [records, tabTotal] = await Promise.all([
      prisma.$queryRawUnsafe<any[]>(
        `SELECT id, name, matricula, unidade, "photoPath", "photoQuality", "detScore" 
         FROM apenados 
         WHERE ${otherNoFaceFilterSql} 
         ORDER BY "photoQuality" DESC 
         LIMIT ${take} OFFSET ${skip}`
      ),
      Promise.resolve(countOther),
    ]);
  } else {
    const where = { faceDescriptor: null, photoPath: { not: null } };
    [records, tabTotal] = await Promise.all([
      prisma.apenado.findMany({ where, select, skip, take, orderBy: { createdAt: 'asc' } }),
      prisma.apenado.count({ where }),
    ]);
  }

  return NextResponse.json({
    stats: { 
      total, 
      indexed, 
      noFace: countDoc + countTattoo + countOther, 
      noFaceDoc: countDoc,
      noFaceTattoo: countTattoo,
      noFaceOther: countOther,
      lowScore, 
      blurry, 
      pending 
    },
    records,
    total: tabTotal,
    skip,
    take,
  });
}
