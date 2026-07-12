import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';

function isAdmin(role: string) {
  return role === 'SUPER_ADMIN' || role === 'ADMIN';
}

export async function DELETE() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const user = session.user as any;
  if (!isAdmin(user.role)) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });

  try {
    // Reseta as embeddings do Antelope de todos os visitantes
    const count = await prisma.sipeVisitante.updateMany({
      data: {
        faceDescriptorAdvanced: null,
      },
    });

    // Também limpa os vetores de pgvector Advanced se existirem
    await prisma.$executeRawUnsafe('UPDATE sipe_visitantes SET "faceVectorAdvanced" = NULL');

    return NextResponse.json({ success: true, count: count.count });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Erro ao limpar dados do Antelope de visitantes' }, { status: 500 });
  }
}
