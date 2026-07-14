import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { auth } from '@/lib/auth';

// GET /api/aip/dossier/check/[apenadoId] - Check if user has permission
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ apenadoId: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }

  const user = session.user as any;
  const { apenadoId } = await params;

  const isAdmin = user.role === 'SUPER_ADMIN' || user.role === 'ADMIN';

  // Se for admin, acesso é liberado
  if (isAdmin) {
    return NextResponse.json({ authorized: true });
  }

  try {
    // Buscar solicitações recentes deste usuário para este apenado
    // Consideramos uma aprovação ativa se tiver sido aprovada nas últimas 24 horas.
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const activeApproval = await prisma.dossierRequest.findFirst({
      where: {
        apenadoId,
        userId: user.id,
        status: 'APPROVED',
        updatedAt: { gte: oneDayAgo },
      },
    });

    if (activeApproval) {
      return NextResponse.json({ authorized: true });
    }

    // Se não há aprovação ativa, verificar se há alguma solicitação pendente
    const pendingRequest = await prisma.dossierRequest.findFirst({
      where: {
        apenadoId,
        userId: user.id,
        status: 'PENDING',
      },
    });

    if (pendingRequest) {
      return NextResponse.json({
        authorized: false,
        status: 'PENDING',
        request: pendingRequest,
      });
    }

    // Verificar se há alguma rejeição recente (últimas 24h)
    const recentRejection = await prisma.dossierRequest.findFirst({
      where: {
        apenadoId,
        userId: user.id,
        status: 'REJECTED',
        updatedAt: { gte: oneDayAgo },
      },
    });

    if (recentRejection) {
      return NextResponse.json({
        authorized: false,
        status: 'REJECTED',
        request: recentRejection,
      });
    }

    // Caso contrário, sem solicitações válidas
    return NextResponse.json({
      authorized: false,
      status: 'NONE',
    });
  } catch (err: any) {
    console.error('Error checking dossier permission:', err);
    return NextResponse.json({ error: 'Erro ao verificar permissão' }, { status: 500 });
  }
}
