import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { z } from 'zod';
import { unaccentParam } from '@/lib/search';

const createApenadoSchema = z.object({
  name: z.string().min(1).max(200),
  matricula: z.string().max(50).optional().nullable(),
  unidade: z.string().max(100).optional().nullable(),
  faccao: z.string().max(100).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const params = req.nextUrl.searchParams;
  const search = unaccentParam(params.get('search'));
  const letter = unaccentParam(params.get('letter')).toUpperCase();
  const skip = Math.max(0, parseInt(params.get('skip') || '0', 10));
  const take = Math.min(Math.max(1, parseInt(params.get('take') || '50', 10)), 1000);

  let whereClause = '';
  const sqlParams: any[] = [];
  let isNumericSearch = false;

  if (search) {
    const pattern = `%${search}%`;
    const isNumeric = /^\d+$/.test(search);
    const sipeIdNum = isNumeric ? parseInt(search, 10) : null;

    if (sipeIdNum !== null) {
      isNumericSearch = true;
      whereClause = `WHERE COALESCE(matricula,'') ILIKE $2
        OR id IN (
          SELECT "apenadoLocalId" FROM sipe_apenados_importados 
          WHERE "sipeId" = $1
        )`;
      sqlParams.push(sipeIdNum, pattern);
    } else {
      whereClause = `WHERE immutable_unaccent(name) % immutable_unaccent($1)
        OR immutable_unaccent(name) ILIKE immutable_unaccent($2)
        OR immutable_unaccent(COALESCE(matricula,'')) ILIKE immutable_unaccent($2)
        OR immutable_unaccent(COALESCE(unidade,'')) ILIKE immutable_unaccent($2)`;
      sqlParams.push(search, pattern);
    }
  } else if (letter) {
    whereClause = `WHERE immutable_unaccent(name) ILIKE immutable_unaccent($1)`;
    sqlParams.push(`${letter}%`);
  }

  const skipIdx = sqlParams.length + 1;
  const takeIdx = sqlParams.length + 2;

  const countQuery = `SELECT COUNT(*)::int AS total FROM apenados ${whereClause}`;
  const dataQuery = `
    SELECT id, name, matricula, unidade, faccao, "photoPath", notes, "createdAt",
           "photoQuality", "faceDescriptor",
           ${(search && !isNumericSearch) ? `similarity(immutable_unaccent(name), immutable_unaccent($1)) AS "searchScore",` : ''}
           EXISTS (
             SELECT 1 FROM sipe_apenados_importados s 
             WHERE s."apenadoLocalId" = apenados.id
           ) AS "isLinkedToSipe"
    FROM apenados
    ${whereClause}
    ORDER BY 
      ${(search && !isNumericSearch) ? `CASE WHEN immutable_unaccent(name) % immutable_unaccent($1) THEN similarity(immutable_unaccent(name), immutable_unaccent($1)) ELSE 0 END DESC,` : ''}
      name ASC
    LIMIT $${takeIdx} OFFSET $${skipIdx}
  `;

  const [countResult, apenados] = await Promise.all([
    prisma.$queryRawUnsafe<{ total: number }[]>(countQuery, ...sqlParams),
    prisma.$queryRawUnsafe<any[]>(dataQuery, ...sqlParams, skip, take),
  ]);

  const total = countResult[0]?.total ?? 0;

  const apenadoIds = apenados.map((a: any) => a.id);
  const importacoes = apenadoIds.length > 0
    ? await prisma.sipeApenadoImportado.findMany({
        where: { apenadoLocalId: { in: apenadoIds } },
        select: {
          apenadoLocalId: true,
          nomeMae: true,
          nomePai: true,
          vinculosVisitante: {
            select: {
              visitante: { select: { nome: true, cpf: true, parentesco: true } },
            },
          },
          vinculosAdvogado: {
            select: {
              advogado: { select: { nome: true, oab: true } },
            },
          },
        },
      })
    : [];

  const vinculosMap = new Map<string, any>();
  importacoes.forEach((imp) => {
    if (imp.apenadoLocalId) {
      vinculosMap.set(imp.apenadoLocalId, {
        nomeMae: imp.nomeMae,
        nomePai: imp.nomePai,
        visitantes: imp.vinculosVisitante.map((v) => ({
          nome: v.visitante.nome,
          cpf: v.visitante.cpf,
          parentesco: v.visitante.parentesco,
        })),
        advogados: imp.vinculosAdvogado.map((v) => ({
          nome: v.advogado.nome,
          oab: v.advogado.oab,
        })),
      });
    }
  });

  const mappedApenados = apenados.map((a: any) => {
    const { faceDescriptor, isLinkedToSipe, ...rest } = a;
    return {
      ...rest,
      isFaceIndexed: faceDescriptor !== null && faceDescriptor !== 'NONE',
      noFaceDetected: faceDescriptor === 'NONE',
      isLinkedToSipe: !!isLinkedToSipe,
      vinculos: vinculosMap.get(a.id) || { nomeMae: null, nomePai: null, visitantes: [], advogados: [] },
    };
  });

  return NextResponse.json({ apenados: mappedApenados, total, skip, take });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const user = session.user as any;
  const body = await req.json();
  const parsed = createApenadoSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Dados inválidos', details: parsed.error.flatten() }, { status: 400 });
  }

  const { name, matricula, unidade, faccao, notes } = parsed.data;

  const apenado = await prisma.apenado.create({
    data: {
      name: name.trim().toUpperCase(),
      matricula: matricula?.trim() || null,
      unidade: unidade?.trim() || null,
      faccao: faccao?.trim() || null,
      notes: notes?.trim() || null,
      createdById: user.id,
    },
  });

  return NextResponse.json(apenado, { status: 201 });
}
