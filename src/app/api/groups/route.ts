import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { createAuditLog, AUDIT_ACTIONS } from '@/lib/audit';

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const groups = await prisma.group.findMany({
    where: { isActive: true },
    include: { _count: { select: { users: true, relints: true } } },
    orderBy: { name: 'asc' },
  });

  return NextResponse.json(groups);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const user = session.user as any;
  if (user.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Apenas super administrador pode criar grupos' }, { status: 403 });
  }

  const body = await req.json();
  if (!body.name) return NextResponse.json({ error: 'Nome obrigatório' }, { status: 400 });

  const group = await prisma.group.create({
    data: {
      name: body.name.toUpperCase(),
      description: body.description,
      color: body.color || '#6172f3',
      icon: body.icon,
    },
  });

  await createAuditLog({
    userId: user.id,
    action: AUDIT_ACTIONS.CREATE_GROUP,
    entity: 'Group',
    entityId: group.id,
    details: { name: group.name },
    request: req,
  });

  return NextResponse.json(group, { status: 201 });
}
