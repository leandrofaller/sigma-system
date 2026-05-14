import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { canAccessMissionBoard } from '@/lib/board-auth';
import { publish } from '@/lib/board-events';

// GET — busca o quadro completo da missão (lists + cards + checklists + assignees + comments)
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  const user = session.user as any;

  const access = await canAccessMissionBoard(params.id, user);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  let lists = await prisma.boardList.findMany({
    where: { missionId: params.id },
    orderBy: { position: 'asc' },
    include: {
      cards: {
        orderBy: { position: 'asc' },
        include: {
          assignees: { include: { user: { select: { id: true, name: true, avatar: true } } } },
          checklist: { orderBy: { position: 'asc' } },
          _count: { select: { comments: true } },
        },
      },
    },
  });

  // Bootstrap: se a missão não tem listas ainda, cria as 3 padrão
  if (lists.length === 0) {
    await prisma.$transaction([
      prisma.boardList.create({ data: { missionId: params.id, name: 'A Fazer', position: 0, color: '#94a3b8' } }),
      prisma.boardList.create({ data: { missionId: params.id, name: 'Em Andamento', position: 1, color: '#f97316' } }),
      prisma.boardList.create({ data: { missionId: params.id, name: 'Concluído', position: 2, color: '#22c55e' } }),
    ]);
    lists = await prisma.boardList.findMany({
      where: { missionId: params.id },
      orderBy: { position: 'asc' },
      include: {
        cards: {
          orderBy: { position: 'asc' },
          include: {
            assignees: { include: { user: { select: { id: true, name: true, avatar: true } } } },
            checklist: { orderBy: { position: 'asc' } },
            _count: { select: { comments: true } },
          },
        },
      },
    });
  }

  return NextResponse.json({ mission: access.mission, lists });
}

// POST — cria nova lista
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  const user = session.user as any;

  const access = await canAccessMissionBoard(params.id, user);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  const body = await req.json();
  if (!body.name?.trim()) return NextResponse.json({ error: 'Nome obrigatório' }, { status: 400 });

  const last = await prisma.boardList.findFirst({
    where: { missionId: params.id },
    orderBy: { position: 'desc' },
    select: { position: true },
  });

  const list = await prisma.boardList.create({
    data: {
      missionId: params.id,
      name: body.name.trim(),
      position: (last?.position ?? -1) + 1,
      color: body.color || '#6172f3',
    },
    include: { cards: true },
  });

  publish({ type: 'list.created', missionId: params.id, payload: list, actorId: user.id });
  return NextResponse.json(list, { status: 201 });
}
