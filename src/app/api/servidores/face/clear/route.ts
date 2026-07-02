import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { invalidateServidorFaceCache } from '@/lib/servidor-face-cache';

export async function DELETE() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const user = session.user as any;
  if (user.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Acesso negado — requer SUPER_ADMIN' }, { status: 403 });
  }

  // Reseta faceDescriptor de todos os servidores
  const result = await prisma.sejusServidor.updateMany({
    where: { faceDescriptor: { not: null } },
    data: { faceDescriptor: null, detScore: null },
  });

  // Limpa faceVector no banco para todos os servidores via query raw
  await prisma.$executeRawUnsafe(
    `UPDATE sejus_servidores SET "faceVector" = NULL WHERE "faceVector" IS NOT NULL`
  ).catch(() => {});

  invalidateServidorFaceCache();

  return NextResponse.json({ cleared: result.count });
}
