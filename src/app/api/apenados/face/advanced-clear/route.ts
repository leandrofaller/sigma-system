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

  // Reseta campos avançados de detecção, qualidade, liveness, descriptor e vetor
  const result = await prisma.apenado.updateMany({
    where: { 
      OR: [
        { faceDescriptorAdvanced: { not: null } },
        { advancedDetScore: { not: null } },
        { advancedQualityScore: { not: null } },
        { advancedLivenessScore: { not: null } }
      ]
    },
    data: {
      faceDescriptorAdvanced: null,
      advancedDetScore: null,
      advancedQualityScore: null,
      advancedLivenessScore: null
    }
  });

  // Também limpa a coluna faceVectorAdvanced no pgvector se aplicável
  try {
    await prisma.$executeRawUnsafe(`UPDATE apenados SET "faceVectorAdvanced" = NULL`);
  } catch (e) {
    console.error('Erro ao limpar vetores avançados no pgvector:', e);
  }

  return NextResponse.json({ cleared: result.count });
}
