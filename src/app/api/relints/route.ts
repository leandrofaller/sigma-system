import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { createAuditLog, AUDIT_ACTIONS } from '@/lib/audit';
import { generateRelintNumber } from '@/lib/utils';

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const user = session.user as any;
  const isAdmin = user.role === 'SUPER_ADMIN' || user.role === 'ADMIN';

  const relints = await prisma.relint.findMany({
    where: isAdmin ? {} : { groupId: user.groupId ?? 'none' },
    orderBy: { createdAt: 'desc' },
    include: { author: { select: { id: true, name: true } }, group: true },
  });

  return NextResponse.json(relints);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const user = session.user as any;
  const body = await req.json();

  const relint = await prisma.relint.create({
    data: {
      number: body.number || generateRelintNumber('RELINT'),
      date: new Date(body.date),
      subject: body.subject,
      diffusion: body.diffusion,
      content: body.content,
      classification: body.classification || 'RESERVADO',
      status: body.status || 'DRAFT',
      authorId: user.id,
      groupId: body.groupId || user.groupId,
      templateId: body.templateId,
    },
    include: { author: true, group: true },
  });

  await createAuditLog({
    userId: user.id,
    action: AUDIT_ACTIONS.CREATE_RELINT,
    entity: 'Relint',
    entityId: relint.id,
    details: { number: relint.number, subject: relint.subject },
    request: req,
  });

  return NextResponse.json(relint, { status: 201 });
}
