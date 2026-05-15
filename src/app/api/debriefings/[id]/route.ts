import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { createAuditLog, AUDIT_ACTIONS } from '@/lib/audit';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const debriefing = await prisma.debriefing.findUnique({
    where: { id: (await params).id },
    include: { author: true, group: true },
  });

  if (!debriefing) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });

  const user = session.user as any;
  const isAdmin = user.role === 'SUPER_ADMIN' || user.role === 'ADMIN';
  if (!isAdmin && debriefing.groupId !== user.groupId) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
  }

  return NextResponse.json(debriefing);
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const body = await req.json();
  const user = session.user as any;

  const existing = await prisma.debriefing.findUnique({ where: { id: (await params).id } });
  if (!existing) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });

  const isAdmin = user.role === 'SUPER_ADMIN' || user.role === 'ADMIN';
  if (!isAdmin && existing.authorId !== user.id) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
  }

  const debriefing = await prisma.debriefing.update({
    where: { id: (await params).id },
    data: {
      date: body.date ? new Date(body.date) : undefined,
      missionDate: body.missionDate ? new Date(body.missionDate) : null,
      missionCode: body.missionCode ?? null,
      operationType: body.operationType ?? null,
      operatives: body.operatives ?? null,
      handler: body.handler ?? null,
      location: body.location ?? null,
      subject: body.subject,
      diffusion: body.diffusion,
      content: body.content,
      classification: body.classification,
      status: body.status,
      groupId: body.groupId,
    },
    include: { author: true, group: true },
  });

  await createAuditLog({
    userId: user.id,
    action: AUDIT_ACTIONS.EDIT_DEBRIEFING,
    entity: 'Debriefing',
    entityId: debriefing.id,
    details: { changes: body },
    request: req,
  });

  return NextResponse.json(debriefing);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const user = session.user as any;

  const debriefing = await prisma.debriefing.findUnique({
    where: { id: (await params).id },
    select: { authorId: true, status: true },
  });

  if (!debriefing) {
    return NextResponse.json({ error: 'Debriefing não encontrado' }, { status: 404 });
  }

  const isSuperAdmin = user.role === 'SUPER_ADMIN';
  const isAdmin = user.role === 'ADMIN';
  const isAuthor = debriefing.authorId === user.id;

  if (isSuperAdmin) {
    await prisma.debriefing.delete({ where: { id: (await params).id } });
  } else if (isAuthor) {
    await prisma.debriefing.update({
      where: { id: (await params).id },
      data: { status: 'DELETION_REQUESTED' as any },
    });

    await createAuditLog({
      userId: user.id,
      action: AUDIT_ACTIONS.DELETE_DEBRIEFING,
      entity: 'Debriefing',
      entityId: (await params).id,
      details: { info: 'Solicitação de exclusão enviada para revisão' },
      request: req,
    });

    return NextResponse.json({ success: true, message: 'Exclusão solicitada para revisão do administrador' });
  } else if (isAdmin && debriefing.status === 'DELETION_REQUESTED') {
    await prisma.debriefing.delete({ where: { id: (await params).id } });
  } else {
    return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
  }

  await createAuditLog({
    userId: user.id,
    action: AUDIT_ACTIONS.DELETE_DEBRIEFING,
    entity: 'Debriefing',
    entityId: (await params).id,
    request: req,
  });

  return NextResponse.json({ success: true });
}
