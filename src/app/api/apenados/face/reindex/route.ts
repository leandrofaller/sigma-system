import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { invalidateFaceCache } from '@/lib/face-cache';

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const user = session.user as any;
  const isAdmin = user.role === 'SUPER_ADMIN' || user.role === 'ADMIN';
  if (!isAdmin) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });

  try {
    const body = await req.json().catch(() => ({}));
    const { id, ids } = body;

    if (ids && Array.isArray(ids) && ids.length > 0) {
      const result = await prisma.apenado.updateMany({
        where: { id: { in: ids }, faceDescriptor: 'NONE' },
        data: { faceDescriptor: null },
      });
      invalidateFaceCache();
      return NextResponse.json({ success: true, count: result.count, message: `${result.count} registros liberados` });
    } else if (id) {
      await prisma.apenado.update({
        where: { id },
        data: { faceDescriptor: null },
      });
      invalidateFaceCache();
      return NextResponse.json({ success: true, message: 'Registro liberado para reindexação' });
    } else {
      const result = await prisma.apenado.updateMany({
        where: { faceDescriptor: 'NONE' },
        data: { faceDescriptor: null },
      });
      invalidateFaceCache();
      return NextResponse.json({ success: true, count: result.count, message: `${result.count} registros liberados` });
    }
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Erro ao reindexar registros' }, { status: 500 });
  }
}
