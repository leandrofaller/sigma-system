import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { stopAdvancedJob } from '@/lib/advanced-indexing-job';
import { invalidateAdvancedFaceCache } from '@/lib/advanced-face-cache';
import { pgvectorAdvancedAvailable } from '@/lib/pgvector';

export async function DELETE() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const user = session.user as any;
  if (user.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Acesso negado — requer SUPER_ADMIN' }, { status: 403 });
  }

  try {
    // Para o job avançado se estiver rodando
    stopAdvancedJob();

    // Limpa a tabela de embeddings no pgvector (campo nativo do postgreSQL) se a coluna existir
    const pvecAvail = await pgvectorAdvancedAvailable();
    if (pvecAvail) {
      await prisma.$executeRawUnsafe('UPDATE apenados SET "faceVectorAdvanced" = NULL');
    }

    // Reseta os campos mapeados no banco via Prisma
    const result = await prisma.apenado.updateMany({
      where: { faceDescriptorAdvanced: { not: null } },
      data: {
        faceDescriptorAdvanced: null,
        advancedDetScore: null,
        advancedQualityScore: null,
        advancedLivenessScore: null,
      },
    });

    // Invalida o cache em memória
    invalidateAdvancedFaceCache();

    return NextResponse.json({ cleared: result.count });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Erro ao reiniciar indexação avançada' }, { status: 500 });
  }
}
