import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { createAuditLog, AUDIT_ACTIONS } from '@/lib/audit';

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const user = session.user as any;
  const isAdmin = user.role === 'SUPER_ADMIN' || user.role === 'ADMIN';

  const debriefings = await prisma.debriefing.findMany({
    where: isAdmin ? {} : { groupId: user.groupId ?? 'none' },
    orderBy: { createdAt: 'desc' },
    include: { author: { select: { id: true, name: true } }, group: true },
  });

  return NextResponse.json(debriefings);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const user = session.user as any;
  const body = await req.json();

  const debriefing = await prisma.debriefing.create({
    data: {
      number: body.number,
      date: new Date(body.date),
      missionDate: body.missionDate ? new Date(body.missionDate) : null,
      missionCode: body.missionCode || null,
      operationType: body.operationType || null,
      operatives: body.operatives || null,
      handler: body.handler || null,
      location: body.location || null,
      subject: body.subject,
      diffusion: body.diffusion,
      content: body.content,
      classification: body.classification || 'RESERVADO',
      status: body.status || 'DRAFT',
      authorId: user.id,
      groupId: body.groupId || user.groupId,
    },
    include: { author: true, group: true },
  });

  await createAuditLog({
    userId: user.id,
    action: AUDIT_ACTIONS.CREATE_DEBRIEFING,
    entity: 'Debriefing',
    entityId: debriefing.id,
    details: { number: debriefing.number, subject: debriefing.subject },
    request: req,
  });

  return NextResponse.json(debriefing, { status: 201 });
}
