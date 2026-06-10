import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { z } from 'zod';
import { containsNormalizedText, normalizeSearchText, startsWithNormalizedText } from '@/lib/search';

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
  const search = normalizeSearchText(params.get('search'));
  const letter = normalizeSearchText(params.get('letter'));
  const skip = Math.max(0, parseInt(params.get('skip') || '0', 10));
  const take = Math.min(Math.max(1, parseInt(params.get('take') || '50', 10)), 1000);

  const allApenados = await prisma.apenado.findMany({
    orderBy: { name: 'asc' },
    select: {
      id: true,
      name: true,
      matricula: true,
      unidade: true,
      faccao: true,
      photoPath: true,
      notes: true,
      createdAt: true,
      photoQuality: true,
      faceDescriptor: true,
    },
  });

  const filteredApenados = allApenados.filter((apenado) => {
    if (search) {
      return (
        containsNormalizedText(apenado.name, search) ||
        containsNormalizedText(apenado.matricula, search) ||
        containsNormalizedText(apenado.unidade, search)
      );
    }

    if (letter) {
      return startsWithNormalizedText(apenado.name, letter);
    }

    return true;
  });

  const total = filteredApenados.length;
  const apenados = filteredApenados.slice(skip, skip + take);

  const mappedApenados = apenados.map((a) => {
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
