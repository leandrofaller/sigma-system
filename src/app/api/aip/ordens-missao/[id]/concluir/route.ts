import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const role = (session.user as any).role;
  const userId = (session.user as any).id;
  const { id: ordemId } = await params;

  try {
    // 1. Busca a ordem de missão
    const ordem = await prisma.ordemMissao.findUnique({
      where: { id: ordemId },
      include: { participantes: true }
    });

    if (!ordem) {
      return NextResponse.json({ error: 'Ordem de missão não encontrada' }, { status: 404 });
    }

    if (ordem.status !== 'ATIVA') {
      return NextResponse.json({ error: 'Esta ordem de missão já foi concluída ou cancelada' }, { status: 400 });
    }

    // 2. Valida se o usuário tem permissão para concluir (participante ou admin/criador)
    const isParticipante = ordem.participantes.some(p => p.userId === userId);
    const isCreatorOrAdmin = ['SUPER_ADMIN', 'ADMIN'].includes(role) || ordem.emitidoPorId === userId;

    if (!isParticipante && !isCreatorOrAdmin) {
      return NextResponse.json({ error: 'Você não tem permissão para concluir esta ordem de missão' }, { status: 403 });
    }

    // 3. Recebe os dados do corpo da requisição
    const body = await req.json();
    const { relatorioConclusao, arquivosConclusao, concluidoPorId } = body;

    if (!relatorioConclusao || relatorioConclusao.trim() === '') {
      return NextResponse.json({ error: 'O relatório de conclusão/imprevistos é obrigatório' }, { status: 400 });
    }

    if (!concluidoPorId) {
      return NextResponse.json({ error: 'O responsável pela conclusão é obrigatório' }, { status: 400 });
    }

    // 4. Atualiza a ordem de missão para concluída
    const updated = await prisma.ordemMissao.update({
      where: { id: ordemId },
      data: {
        status: 'CONCLUIDA',
        concluidoPorId: concluidoPorId,
        concluidoEm: new Date(),
        relatorioConclusao: relatorioConclusao.trim(),
        arquivosConclusao: Array.isArray(arquivosConclusao) ? arquivosConclusao : []
      },
      include: {
        emitidoPor: { select: { id: true, name: true, role: true, avatar: true } },
        concluidoPor: { select: { id: true, name: true, role: true, avatar: true } },
        participantes: {
          include: { user: { select: { id: true, name: true, role: true, avatar: true } } },
          orderBy: { createdAt: 'asc' },
        },
      }
    });

    return NextResponse.json({ ordem: updated });

  } catch (error: any) {
    console.error('[ORDEM MISSAO CONCLUIR] Erro:', error);
    return NextResponse.json({ error: error?.message || 'Erro interno ao concluir ordem de missão' }, { status: 500 });
  }
}
