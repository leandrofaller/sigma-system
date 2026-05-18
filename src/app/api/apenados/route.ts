import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const search = req.nextUrl.searchParams.get('search')?.trim() || '';

  const apenados = await prisma.apenado.findMany({
    where: search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { matricula: { contains: search, mode: 'insensitive' } },
            { unidade: { contains: search, mode: 'insensitive' } },
          ],
        }
      : undefined,
    orderBy: { name: 'asc' },
    select: {
      id: true,
      name: true,
      matricula: true,
      unidade: true,
      photoPath: true,
      notes: true,
      createdAt: true,
    },
  });

  return NextResponse.json(apenados);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const user = session.user as any;
  const body = await req.json();
  const { name, matricula, unidade, notes } = body;

  if (!name?.trim()) {
    return NextResponse.json({ error: 'Nome é obrigatório' }, { status: 400 });
  }

  const apenado = await prisma.apenado.create({
    data: {
      name: name.trim().toUpperCase(),
      matricula: matricula?.trim() || null,
      unidade: unidade?.trim() || null,
      notes: notes?.trim() || null,
      createdById: user.id,
    },
  });

  return NextResponse.json(apenado, { status: 201 });
}
