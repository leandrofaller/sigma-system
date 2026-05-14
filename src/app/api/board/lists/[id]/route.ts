import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { canAccessMissionBoard, missionIdFromList } from '@/lib/board-auth';
import { publish } from '@/lib/board-events';

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  const user = session.user as any;

  const missionId = await missionIdFromList(params.id);
  if (!missionId) return NextResponse.json({ error: 'Lista não encontrada' }, { status: 404 });
  const access = await canAccessMissionBoard(missionId, user);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  const body = await req.json();
  const list = await prisma.boardList.update({
    where: { id: params.id },
    data: {
      name: body.name?.trim() || undefined,
      color: body.color || undefined,
      position: body.position !== undefined ? body.position : undefined,
    },
  });

  publish({ type: 'list.updated', missionId, payload: list, actorId: user.id });
  return NextResponse.json(list);
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  const user = session.user as any;

  const missionId = await missionIdFromList(params.id);
  if (!missionId) return NextResponse.json({ error: 'Lista não encontrada' }, { status: 404 });
  const access = await canAccessMissionBoard(missionId, user);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  await prisma.boardList.delete({ where: { id: params.id } });
  publish({ type: 'list.deleted', missionId, payload: { id: params.id }, actorId: user.id });
  return NextResponse.json({ success: true });
}
