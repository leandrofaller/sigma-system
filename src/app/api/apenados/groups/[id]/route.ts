import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const user = session.user as any;
  if (user.role !== 'SUPER_ADMIN' && user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
  }

  const { id } = await params;
  const group = await prisma.apenadoGroup.findUnique({ where: { id } });
  if (!group) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });

  await prisma.apenadoGroup.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
