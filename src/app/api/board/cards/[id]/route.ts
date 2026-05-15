import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { canAccessMissionBoard, missionIdFromCard, missionIdFromList } from '@/lib/board-auth';
import { publish } from '@/lib/board-events';

// GET — detalhes completos de um card (inclui comentários)
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  const user = session.user as any;

  const missionId = await missionIdFromCard((await params).id);
  if (!missionId) return NextResponse.json({ error: 'Card não encontrado' }, { status: 404 });
  const access = await canAccessMissionBoard(missionId, user);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  const card = await prisma.boardCard.findUnique({
    where: { id: (await params).id },
    include: {
      assignees: { include: { user: { select: { id: true, name: true, avatar: true } } } },
      checklist: { orderBy: { position: 'asc' } },
      comments: {
        orderBy: { createdAt: 'asc' },
        include: { author: { select: { id: true, name: true, avatar: true } } },
      },
      createdBy: { select: { id: true, name: true } },
    },
  });
  return NextResponse.json(card);
}

// PATCH — atualiza qualquer campo do card. Suporta MOVER entre listas via listId + position.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  const user = session.user as any;

  const missionId = await missionIdFromCard((await params).id);
  if (!missionId) return NextResponse.json({ error: 'Card não encontrado' }, { status: 404 });
  const access = await canAccessMissionBoard(missionId, user);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  const body = await req.json();

  // se trocou de lista, valida que a nova lista pertence à mesma missão
  if (body.listId) {
    const newListMission = await missionIdFromList(body.listId);
    if (newListMission !== missionId) {
      return NextResponse.json({ error: 'Lista não pertence a esta missão' }, { status: 400 });
    }
  }

  const wasMove = body.listId !== undefined || body.position !== undefined;

  const card = await prisma.boardCard.update({
    where: { id: (await params).id },
    data: {
      title: body.title !== undefined ? body.title : undefined,
      description: body.description !== undefined ? body.description : undefined,
      position: body.position !== undefined ? body.position : undefined,
      listId: body.listId !== undefined ? body.listId : undefined,
      dueDate: body.dueDate !== undefined ? (body.dueDate ? new Date(body.dueDate) : null) : undefined,
    },
    include: {
      assignees: { include: { user: { select: { id: true, name: true, avatar: true } } } },
      checklist: { orderBy: { position: 'asc' } },
      _count: { select: { comments: true } },
    },
  });

  publish({
    type: wasMove ? 'card.moved' : 'card.updated',
    missionId,
    payload: card,
    actorId: user.id,
  });
  return NextResponse.json(card);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  const user = session.user as any;

  const missionId = await missionIdFromCard((await params).id);
  if (!missionId) return NextResponse.json({ error: 'Card não encontrado' }, { status: 404 });
  const access = await canAccessMissionBoard(missionId, user);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  await prisma.boardCard.delete({ where: { id: (await params).id } });
  publish({ type: 'card.deleted', missionId, payload: { id: (await params).id }, actorId: user.id });
  return NextResponse.json({ success: true });
}
