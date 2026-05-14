import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { canAccessMissionBoard, missionIdFromChecklist } from '@/lib/board-auth';
import { publish } from '@/lib/board-events';

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  const user = session.user as any;

  const missionId = await missionIdFromChecklist(params.id);
  if (!missionId) return NextResponse.json({ error: 'Item não encontrado' }, { status: 404 });
  const access = await canAccessMissionBoard(missionId, user);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  const body = await req.json();
  const item = await prisma.boardChecklistItem.update({
    where: { id: params.id },
    data: {
      text: body.text !== undefined ? body.text : undefined,
      done: body.done !== undefined ? !!body.done : undefined,
      position: body.position !== undefined ? body.position : undefined,
    },
  });

  publish({ type: 'checklist.updated', missionId, payload: { cardId: item.cardId, item }, actorId: user.id });
  return NextResponse.json(item);
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  const user = session.user as any;

  const missionId = await missionIdFromChecklist(params.id);
  if (!missionId) return NextResponse.json({ error: 'Item não encontrado' }, { status: 404 });
  const access = await canAccessMissionBoard(missionId, user);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  const item = await prisma.boardChecklistItem.findUnique({ where: { id: params.id }, select: { cardId: true } });
  await prisma.boardChecklistItem.delete({ where: { id: params.id } });

  publish({ type: 'checklist.deleted', missionId, payload: { id: params.id, cardId: item?.cardId }, actorId: user.id });
  return NextResponse.json({ success: true });
}
