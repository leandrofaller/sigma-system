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
  if (!body.text?.trim()) return NextResponse.json({ error: 'Texto obrigatório' }, { status: 400 });

  const last = await prisma.boardChecklistItem.findFirst({
    where: { cardId: (await params).id },
    orderBy: { position: 'desc' },
    select: { position: true },
  });

  const item = await prisma.boardChecklistItem.create({
    data: {
      cardId: (await params).id,
      text: body.text.trim(),
      position: (last?.position ?? -1) + 1,
    },
  });

  publish({ type: 'checklist.created', missionId, payload: { cardId: (await params).id, item }, actorId: user.id });
  return NextResponse.json(item, { status: 201 });
}
