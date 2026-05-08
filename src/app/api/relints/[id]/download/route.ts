import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { createAuditLog, AUDIT_ACTIONS } from '@/lib/audit';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const relint = await prisma.relint.findUnique({
    where: { id: params.id },
    include: { author: true, group: true },
  });

  if (!relint) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });

  const user = session.user as any;
  const isAdmin = user.role === 'SUPER_ADMIN' || user.role === 'ADMIN';
  if (!isAdmin && relint.groupId !== user.groupId) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
  }

  await createAuditLog({
    userId: user.id,
    action: AUDIT_ACTIONS.DOWNLOAD_RELINT,
    entity: 'Relint',
    entityId: relint.id,
    request: req,
  });

  // Return JSON for client-side PDF generation
  return NextResponse.json(relint);
}
