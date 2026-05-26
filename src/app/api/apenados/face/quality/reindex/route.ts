import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';

/** Reseta faceDescriptor e detScore para re-indexação pelo job de background. */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const user = session.user as any;
  if (user.role !== 'SUPER_ADMIN' && user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const ids: string[] = Array.isArray(body?.ids) ? body.ids.slice(0, 200) : [];

  if (ids.length === 0) {
    return NextResponse.json({ error: 'ids obrigatório' }, { status: 400 });
  }

  const { count } = await prisma.apenado.updateMany({
    where: { id: { in: ids } },
    data: { faceDescriptor: null, detScore: null },
  });

  return NextResponse.json({ reset: count });
}
