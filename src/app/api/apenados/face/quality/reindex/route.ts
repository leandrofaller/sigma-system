import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';

import { getPrismaWhereForTab, getSqlFilterForTab } from '@/lib/face-quality-filters';

/** Reseta faceDescriptor e detScore para re-indexação pelo job de background. */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const user = session.user as any;
  if (user.role !== 'SUPER_ADMIN' && user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const isAll = !!body?.all;
  const tab = body?.tab || '';

  let resetCount = 0;

  if (isAll) {
    if (!tab) {
      return NextResponse.json({ error: 'Aba não especificada para re-indexação global' }, { status: 400 });
    }

    const prismaWhere = getPrismaWhereForTab(tab);
    const sqlFilter = getSqlFilterForTab(tab);

    if (sqlFilter) {
      const result = await prisma.$executeRawUnsafe(
        `UPDATE apenados 
         SET "faceDescriptor" = NULL, "detScore" = NULL 
         WHERE ${sqlFilter}`
      );
      resetCount = result;
    } else if (Object.keys(prismaWhere).length > 0) {
      const result = await prisma.apenado.updateMany({
        where: prismaWhere,
        data: { faceDescriptor: null, detScore: null },
      });
      resetCount = result.count;
    } else {
      return NextResponse.json({ error: 'Aba inválida para re-indexação global' }, { status: 400 });
    }
  } else {
    const ids: string[] = Array.isArray(body?.ids) ? body.ids : [];
    if (ids.length === 0) {
      return NextResponse.json({ error: 'ids obrigatório' }, { status: 400 });
    }

    const { count } = await prisma.apenado.updateMany({
      where: { id: { in: ids } },
      data: { faceDescriptor: null, detScore: null },
    });
    resetCount = count;
  }

  return NextResponse.json({ reset: resetCount });
}
