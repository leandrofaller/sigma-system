import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { createAuditLog, AUDIT_ACTIONS } from '@/lib/audit';

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const user = session.user as any;
  if (user.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
  }

  const configs = await prisma.systemConfig.findMany();
  const result = Object.fromEntries(configs.map((c) => [c.key, c.value]));
  return NextResponse.json(result);
}

export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const user = session.user as any;
  if (user.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
  }

  const body = await req.json();

  const updates = await Promise.all(
    Object.entries(body).map(([key, value]) =>
      prisma.systemConfig.upsert({
        where: { key },
        update: { value: value as any, updatedBy: user.id },
        create: { key, value: value as any, updatedBy: user.id },
      })
    )
  );

  await createAuditLog({
    userId: user.id,
    action: AUDIT_ACTIONS.CHANGE_CONFIG,
    details: { keys: Object.keys(body) },
    request: req,
  });

  return NextResponse.json({ success: true, updated: updates.length });
}
