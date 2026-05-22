import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { createAuditLog, AUDIT_ACTIONS } from '@/lib/audit';

function isAdmin(role: string) {
  return role === 'SUPER_ADMIN' || role === 'ADMIN';
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const user = session.user as any;
  if (!isAdmin(user.role)) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status');
  const userId = searchParams.get('userId');

  const devices = await prisma.userDevice.findMany({
    where: {
      ...(status ? { status: status as any } : {}),
      ...(userId ? { userId } : {}),
    },
    include: {
      user: { select: { id: true, name: true, email: true, role: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  const pendingCount = await prisma.userDevice.count({ where: { status: 'PENDING' } });

  return NextResponse.json({ devices, pendingCount });
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const user = session.user as any;
  if (!isAdmin(user.role)) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });

  const body = await req.json();
  const { id, status } = body as { id: string; status: 'AUTHORIZED' | 'REVOKED' };

  if (!id || !['AUTHORIZED', 'REVOKED'].includes(status)) {
    return NextResponse.json({ error: 'Parâmetros inválidos' }, { status: 400 });
  }

  const device = await prisma.userDevice.update({
    where: { id },
    data: {
      status,
      ...(status === 'AUTHORIZED' ? { authorizedBy: user.id, authorizedAt: new Date() } : {}),
    },
    include: { user: { select: { name: true, email: true } } },
  });

  await createAuditLog({
    userId: user.id,
    action: status === 'AUTHORIZED' ? AUDIT_ACTIONS.DEVICE_AUTHORIZED : AUDIT_ACTIONS.DEVICE_REVOKED,
    entity: 'UserDevice',
    entityId: id,
    details: { deviceName: device.name, targetUser: device.user.email, newStatus: status },
    request: req,
  });

  return NextResponse.json({ device });
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const user = session.user as any;
  if (!isAdmin(user.role)) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');

  if (!id) return NextResponse.json({ error: 'ID obrigatório' }, { status: 400 });

  await prisma.userDevice.delete({ where: { id } });

  return NextResponse.json({ success: true });
}
