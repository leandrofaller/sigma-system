import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { canAccessMissionBoard, missionIdFromList } from '@/lib/board-auth';
import { publish } from '@/lib/board-events';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  const user = session.user as any;

  const missionId = await missionIdFromList(params.id);
  if (!missionId) return NextResponse.json({ error: 'Lista não encontrada' }, { status: 404 });
  const access = await canAccessMissionBoard(missionId, user);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  const body = await req.json();
  if (!body.title?.trim()) return NextResponse.json({ error: 'Título obrigatório' }, { status: 400 });

  const last = await prisma.boardCard.findFirst({
    where: { listId: params.id },
    orderBy: { position: 'desc' },
    select: { position: true },
  });

  const card = await prisma.boardCard.create({
    data: {
      listId: params.id,
      title: body.title.trim(),
      description: body.description || null,
      position: (last?.position ?? -1) + 1,
      dueDate: body.dueDate ? new Date(body.dueDate) : null,
      createdById: user.id,
    },
    include: {
      assignees: { include: { user: { select: { id: true, name: true, avatar: true } } } },
      checklist: true,
      _count: { select: { comments: true } },
    },
  });

  publish({ type: 'card.created', missionId, payload: card, actorId: user.id });
  return NextResponse.json(card, { status: 201 });
}
