import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { invalidateVisitanteFaceCache } from '@/lib/visitante-face-cache';

export async function DELETE() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const user = session.user as any;
  if (user.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Acesso negado — requer SUPER_ADMIN' }, { status: 403 });
  }

  // Reseta faceDescriptor de todos os visitantes
  const result = await prisma.sipeVisitante.updateMany({
    where: { faceDescriptor: { not: null } },
    data: { faceDescriptor: null, detScore: null },
  });

  // Limpa faceVector no banco para todos os visitantes via query raw
  await prisma.$executeRawUnsafe(
    `UPDATE sipe_visitantes SET "faceVector" = NULL WHERE "faceVector" IS NOT NULL`
  ).catch(() => {});

  invalidateVisitanteFaceCache();

  return NextResponse.json({ cleared: result.count });
}
