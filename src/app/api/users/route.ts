import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import bcrypt from 'bcryptjs';
import { createAuditLog, AUDIT_ACTIONS } from '@/lib/audit';

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const user = session.user as any;
  if (user.role !== 'SUPER_ADMIN' && user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
  }

  const users = await prisma.user.findMany({
    orderBy: { createdAt: 'desc' },
    select: {
      id: true, name: true, email: true, phone: true, role: true,
      isActive: true, createdAt: true, lastLogin: true,
      group: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json(users);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const current = session.user as any;
  if (current.role !== 'SUPER_ADMIN' && current.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
  }

  const body = await req.json();

  if (!body.email || !body.password || !body.name) {
    return NextResponse.json({ error: 'Dados obrigatórios faltando' }, { status: 400 });
  }

  const exists = await prisma.user.findUnique({ where: { email: body.email } });
  if (exists) return NextResponse.json({ error: 'E-mail já cadastrado' }, { status: 409 });

  // Admins não podem criar SUPER_ADMIN
  if (current.role === 'ADMIN' && body.role === 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Permissão insuficiente' }, { status: 403 });
  }

  const hash = await bcrypt.hash(body.password, 12);
  const user = await prisma.user.create({
    data: {
      name: body.name,
      email: body.email,
      phone: body.phone,
      passwordHash: hash,
      role: body.role || 'OPERATOR',
      groupId: body.groupId || null,
    },
    include: { group: true },
  });

  await createAuditLog({
    userId: current.id,
    action: AUDIT_ACTIONS.CREATE_USER,
    entity: 'User',
    entityId: user.id,
    details: { name: user.name, email: user.email, role: user.role },
    request: req,
  });

  const { passwordHash: _, ...safeUser } = user;
  return NextResponse.json(safeUser, { status: 201 });
}
