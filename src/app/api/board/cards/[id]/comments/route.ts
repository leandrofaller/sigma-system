import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { canAccessMissionBoard, missionIdFromCard } from '@/lib/board-auth';
import { publish } from '@/lib/board-events';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  const user = session.user as any;

  const missionId = await missionIdFromCard(params.id);
  if (!missionId) return NextResponse.json({ error: 'Card não encontrado' }, { status: 404 });
  const access = await canAccessMissionBoard(missionId, user);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  const body = await req.json();
  if (!body.content?.trim()) return NextResponse.json({ error: 'Conteúdo obrigatório' }, { status: 400 });

  const comment = await prisma.boardComment.create({
    data: {
      cardId: params.id,
      authorId: user.id,
      content: body.content.trim(),
    },
    include: { author: { select: { id: true, name: true, avatar: true } } },
  });

  publish({ type: 'comment.created', missionId, payload: { cardId: params.id, comment }, actorId: user.id });
  return NextResponse.json(comment, { status: 201 });
}
