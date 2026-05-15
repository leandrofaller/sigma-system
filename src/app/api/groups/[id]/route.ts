import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { createAuditLog, AUDIT_ACTIONS } from '@/lib/audit';

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const user = session.user as any;
  if (user.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
  }

  const body = await req.json();
  const group = await prisma.group.update({
    where: { id: (await params).id },
    data: {
      name: body.name?.toUpperCase(),
      description: body.description,
      color: body.color,
      icon: body.icon,
      isActive: body.isActive,
    },
  });

  await createAuditLog({ userId: user.id, action: AUDIT_ACTIONS.EDIT_GROUP, entity: 'Group', entityId: group.id, request: req });
  return NextResponse.json(group);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const user = session.user as any;
  if (user.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
  }

  await prisma.group.update({ where: { id: (await params).id }, data: { isActive: false } });
  await createAuditLog({ userId: user.id, action: AUDIT_ACTIONS.DELETE_GROUP, entity: 'Group', entityId: (await params).id, request: req });
  return NextResponse.json({ success: true });
}
