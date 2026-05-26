import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';

const memberSelect = {
  apenadoId: true,
  similarity: true,
  addedAt: true,
  apenado: {
    select: { id: true, name: true, matricula: true, unidade: true, photoPath: true },
  },
};

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const groups = await prisma.apenadoGroup.findMany({
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      name: true,
      description: true,
      baseApenadoId: true,
      createdAt: true,
      createdBy: { select: { id: true, name: true } },
      members: { select: memberSelect, orderBy: { similarity: 'desc' } },
    },
  });

  return NextResponse.json(groups);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const user = session.user as any;
  if (user.role !== 'SUPER_ADMIN' && user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const { name, description, baseApenadoId, members } = body as {
    name: string;
    description?: string;
    baseApenadoId?: string;
    members: Array<{ apenadoId: string; similarity?: number }>;
  };

  if (!name?.trim()) return NextResponse.json({ error: 'Nome obrigatório' }, { status: 400 });
  if (!Array.isArray(members) || members.length === 0)
    return NextResponse.json({ error: 'Selecione ao menos um membro' }, { status: 400 });

  const group = await prisma.apenadoGroup.create({
    data: {
      name: name.trim(),
      description: description?.trim() || null,
      baseApenadoId: baseApenadoId || null,
      createdById: user.id,
      members: {
        create: members.map((m) => ({
          apenadoId: m.apenadoId,
          similarity: typeof m.similarity === 'number' ? m.similarity : null,
        })),
      },
    },
    select: {
      id: true,
      name: true,
      description: true,
      baseApenadoId: true,
      createdAt: true,
      members: { select: memberSelect },
    },
  });

  return NextResponse.json(group, { status: 201 });
}
