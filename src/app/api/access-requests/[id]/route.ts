import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';

const ROLES = ['SUPER_ADMIN', 'ADMIN', 'OPERATOR'] as const;

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const current = session.user as any;
  if (current.role !== 'SUPER_ADMIN' && current.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
  }

  const body = await req.json();
  const { action, groupId, role, tempPassword } = body;

  if (!['APPROVED', 'DENIED'].includes(action)) {
    return NextResponse.json({ error: 'Ação inválida' }, { status: 400 });
  }

  const request = await prisma.accessRequest.findUnique({ where: { id: (await params).id } });
  if (!request) return NextResponse.json({ error: 'Solicitação não encontrada' }, { status: 404 });

  await prisma.accessRequest.update({
    where: { id: (await params).id },
    data: { status: action, reviewedBy: current.id, reviewedAt: new Date() },
  });

  if (action === 'APPROVED') {
    const requestedRole = ROLES.includes(role) ? role : 'OPERATOR';
    if (current.role === 'ADMIN' && requestedRole === 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Permissão insuficiente' }, { status: 403 });
    }

    const password = typeof tempPassword === 'string' && tempPassword.length >= 8
      ? tempPassword
      : `${randomBytes(9).toString('base64url')}A1!`;
    const hash = await bcrypt.hash(password, 12);

    const user = await prisma.user.create({
      data: {
        name: request.name,
        email: request.email,
        passwordHash: hash,
        role: requestedRole,
        groupId: groupId || null,
      },
    });

    return NextResponse.json({ success: true, userId: user.id, tempPassword: password });
  }

  return NextResponse.json({ success: true });
}
