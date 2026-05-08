import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import bcrypt from 'bcryptjs';
import { createAuditLog, AUDIT_ACTIONS } from '@/lib/audit';

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const current = session.user as any;
  if (current.role !== 'SUPER_ADMIN' && current.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
  }

  const body = await req.json();
  const updateData: any = {
    name: body.name,
    phone: body.phone,
    role: body.role,
    groupId: body.groupId,
    isActive: body.isActive,
  };

  if (body.password) {
    updateData.passwordHash = await bcrypt.hash(body.password, 12);
  }

  // Admin não pode alterar SUPER_ADMIN nem promover a SUPER_ADMIN
  if (current.role === 'ADMIN') {
    const target = await prisma.user.findUnique({ where: { id: params.id } });
    if (target?.role === 'SUPER_ADMIN' || body.role === 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Permissão insuficiente' }, { status: 403 });
    }
  }

  const user = await prisma.user.update({
    where: { id: params.id },
    data: updateData,
    include: { group: true },
  });

  await createAuditLog({
    userId: current.id,
    action: AUDIT_ACTIONS.EDIT_USER,
    entity: 'User',
    entityId: user.id,
    request: req,
  });

  const { passwordHash: _, ...safeUser } = user;
  return NextResponse.json(safeUser);
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const current = session.user as any;
  if (current.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Apenas super administrador pode excluir usuários' }, { status: 403 });
  }

  if (params.id === current.id) {
    return NextResponse.json({ error: 'Não é possível excluir sua própria conta' }, { status: 400 });
  }

  await prisma.user.delete({ where: { id: params.id } });

  await createAuditLog({
    userId: current.id,
    action: AUDIT_ACTIONS.DELETE_USER,
    entity: 'User',
    entityId: params.id,
    request: req,
  });

  return NextResponse.json({ success: true });
}
