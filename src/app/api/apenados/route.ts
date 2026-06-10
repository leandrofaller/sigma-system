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

  if (search) {
    const pattern = `%${search}%`;
    whereClause = `WHERE immutable_unaccent(name) ILIKE immutable_unaccent($1)
      OR immutable_unaccent(COALESCE(matricula,'')) ILIKE immutable_unaccent($1)
      OR immutable_unaccent(COALESCE(unidade,'')) ILIKE immutable_unaccent($1)`;
    sqlParams.push(pattern);
  } else if (letter) {
    whereClause = `WHERE immutable_unaccent(name) ILIKE immutable_unaccent($1)`;
    sqlParams.push(`${letter}%`);
  }

  const skipIdx = sqlParams.length + 1;
  const takeIdx = sqlParams.length + 2;

  const countQuery = `SELECT COUNT(*)::int AS total FROM apenados ${whereClause}`;
  const dataQuery = `
    SELECT id, name, matricula, unidade, faccao, "photoPath", notes, "createdAt",
           "photoQuality", "faceDescriptor"
    FROM apenados
    ${whereClause}
    ORDER BY name ASC
    LIMIT $${takeIdx} OFFSET $${skipIdx}
  `;

  const [countResult, apenados] = await Promise.all([
    prisma.$queryRawUnsafe<{ total: number }[]>(countQuery, ...sqlParams),
    prisma.$queryRawUnsafe<any[]>(dataQuery, ...sqlParams, skip, take),
  ]);

  const total = countResult[0]?.total ?? 0;

  const mappedApenados = apenados.map((a: any) => {
    const { faceDescriptor, ...rest } = a;
    return {
      ...rest,
      isFaceIndexed: faceDescriptor !== null && faceDescriptor !== 'NONE',
      noFaceDetected: faceDescriptor === 'NONE',
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
