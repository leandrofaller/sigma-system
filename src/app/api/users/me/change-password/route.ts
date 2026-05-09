import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import bcrypt from 'bcryptjs';
import { createAuditLog, AUDIT_ACTIONS } from '@/lib/audit';

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const current = session.user as any;
  const body = await req.json();
  const { currentPassword, newPassword, targetUserId } = body;

  const isAdmin = current.role === 'SUPER_ADMIN' || current.role === 'ADMIN';
  const changingOther = targetUserId && targetUserId !== current.id;

  if (changingOther && !isAdmin) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
  }

  const userId = changingOther ? targetUserId : current.id;

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });

  // Admin alterando outro usuário não precisa da senha atual
  if (!changingOther) {
    if (!currentPassword) {
      return NextResponse.json({ error: 'Senha atual obrigatória' }, { status: 400 });
    }
    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) {
      return NextResponse.json({ error: 'Senha atual incorreta' }, { status: 400 });
    }
  } else if (changingOther && current.role === 'ADMIN') {
    const target = await prisma.user.findUnique({ where: { id: userId } });
    if (target?.role === 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Permissão insuficiente' }, { status: 403 });
    }
  }

  if (!newPassword || newPassword.length < 8) {
    return NextResponse.json({ error: 'Nova senha deve ter no mínimo 8 caracteres' }, { status: 400 });
  }

  const hash = await bcrypt.hash(newPassword, 12);
  await prisma.user.update({ where: { id: userId }, data: { passwordHash: hash } });

  await createAuditLog({
    userId: current.id,
    action: AUDIT_ACTIONS.EDIT_USER,
    entity: 'User',
    entityId: userId,
    request: req,
    details: { action: 'change_password' },
  });

  return NextResponse.json({ success: true });
}
