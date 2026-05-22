import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';

export async function DELETE() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const user = session.user as any;
  if (user.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Acesso negado — requer SUPER_ADMIN' }, { status: 403 });
  }

  const result = await prisma.apenado.updateMany({
    where: { faceDescriptor: { not: null } },
    data: { faceDescriptor: null },
  });

  return NextResponse.json({ cleared: result.count });
}
