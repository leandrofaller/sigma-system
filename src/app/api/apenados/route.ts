import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import type { Prisma } from '@prisma/client';

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const params = req.nextUrl.searchParams;
  const search = params.get('search')?.trim() || '';
  const letter = params.get('letter')?.trim().toUpperCase() || '';
  const skip = Math.max(0, parseInt(params.get('skip') || '0', 10));
  const take = Math.min(Math.max(1, parseInt(params.get('take') || '50', 10)), 1000);

  let where: Prisma.ApenadoWhereInput | undefined;
  if (search) {
    where = {
      OR: [
        { name: { contains: search, mode: 'insensitive' } },
        { matricula: { contains: search, mode: 'insensitive' } },
        { unidade: { contains: search, mode: 'insensitive' } },
      ],
    };
  } else if (letter) {
    where = { name: { startsWith: letter, mode: 'insensitive' } };
  }

  const [apenados, total] = await Promise.all([
    prisma.apenado.findMany({
      where,
      orderBy: { name: 'asc' },
      skip,
      take,
      select: {
        id: true,
        name: true,
        matricula: true,
        unidade: true,
        faccao: true,
        photoPath: true,
        notes: true,
        createdAt: true,
      },
    }),
    prisma.apenado.count({ where }),
  ]);

  return NextResponse.json({ apenados, total, skip, take });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const user = session.user as any;
  const body = await req.json();
  const { name, matricula, unidade, faccao, notes } = body;

  if (!name?.trim()) {
    return NextResponse.json({ error: 'Nome é obrigatório' }, { status: 400 });
  }

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
