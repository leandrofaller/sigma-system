import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { canAccessMissionBoard, missionIdFromComment } from '@/lib/board-auth';
import { publish } from '@/lib/board-events';

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  const user = session.user as any;

  const missionId = await missionIdFromComment((await params).id);
  if (!missionId) return NextResponse.json({ error: 'Comentário não encontrado' }, { status: 404 });

  const comment = await prisma.boardComment.findUnique({ where: { id: (await params).id }, select: { authorId: true, cardId: true } });
  if (!comment) return NextResponse.json({ error: 'Comentário não encontrado' }, { status: 404 });

  const isAdmin = user.role === 'SUPER_ADMIN' || user.role === 'ADMIN';
  if (!isAdmin && comment.authorId !== user.id) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });
  }

  const access = await canAccessMissionBoard(missionId, user);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  await prisma.boardComment.delete({ where: { id: (await params).id } });
  publish({ type: 'comment.deleted', missionId, payload: { id: (await params).id, cardId: comment.cardId }, actorId: user.id });
  return NextResponse.json({ success: true });
}
