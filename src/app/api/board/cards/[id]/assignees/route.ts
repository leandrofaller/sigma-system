import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { canAccessMissionBoard, missionIdFromCard } from '@/lib/board-auth';
import { publish } from '@/lib/board-events';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  const user = session.user as any;

  const missionId = await missionIdFromCard((await params).id);
  if (!missionId) return NextResponse.json({ error: 'Card não encontrado' }, { status: 404 });
  const access = await canAccessMissionBoard(missionId, user);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  const body = await req.json();
  if (!body.userId) return NextResponse.json({ error: 'userId obrigatório' }, { status: 400 });

  await prisma.boardCardAssignee.upsert({
    where: { cardId_userId: { cardId: (await params).id, userId: body.userId } },
    create: { cardId: (await params).id, userId: body.userId },
    update: {},
  });

  const u = await prisma.user.findUnique({ where: { id: body.userId }, select: { id: true, name: true, avatar: true } });
  publish({ type: 'assignee.added', missionId, payload: { cardId: (await params).id, user: u }, actorId: user.id });
  return NextResponse.json(u, { status: 201 });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  const user = session.user as any;

  const missionId = await missionIdFromCard((await params).id);
  if (!missionId) return NextResponse.json({ error: 'Card não encontrado' }, { status: 404 });
  const access = await canAccessMissionBoard(missionId, user);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  const url = new URL(req.url);
  const userId = url.searchParams.get('userId');
  if (!userId) return NextResponse.json({ error: 'userId obrigatório' }, { status: 400 });

  await prisma.boardCardAssignee.delete({
    where: { cardId_userId: { cardId: (await params).id, userId } },
  }).catch(() => {});

  publish({ type: 'assignee.removed', missionId, payload: { cardId: (await params).id, userId }, actorId: user.id });
  return NextResponse.json({ success: true });
}
