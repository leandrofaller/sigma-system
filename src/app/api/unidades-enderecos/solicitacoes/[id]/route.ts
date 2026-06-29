import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import {
  aprovarSolicitacao,
  isAdminRole,
  loadUnidadeById,
  rejeitarSolicitacao,
} from '@/lib/unidades-enderecos-catalog'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const user = session.user as { id?: string; role?: string }
  if (!isAdminRole(user.role) || !user.id) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }

  const { id } = await params
  const body = await req.json() as { acao?: string; motivo?: string }
  const acao = body.acao?.toUpperCase()

  if (acao !== 'APROVAR' && acao !== 'REJEITAR') {
    return NextResponse.json({ error: 'Ação inválida. Use APROVAR ou REJEITAR' }, { status: 400 })
  }

  try {
    const sol =
      acao === 'APROVAR'
        ? await aprovarSolicitacao(id, user.id)
        : await rejeitarSolicitacao(id, user.id, body.motivo)

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: acao === 'APROVAR' ? 'UNIDADE_ENDERECO_APROVADA' : 'UNIDADE_ENDERECO_REJEITADA',
        entity: 'UnidadeEnderecoSolicitacao',
        entityId: id,
        details: { unidadeId: sol.unidadeId, motivo: body.motivo ?? null },
      },
    })

    const unidade = await loadUnidadeById(sol.unidadeId)
    return NextResponse.json({ solicitacao: sol, unidade })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Erro'
    if (msg === 'SOLICITACAO_NAO_ENCONTRADA') {
      return NextResponse.json({ error: 'Solicitação não encontrada' }, { status: 404 })
    }
    if (msg === 'SOLICITACAO_JA_REVISADA') {
      return NextResponse.json({ error: 'Solicitação já foi revisada' }, { status: 409 })
    }
    console.error('[unidades-enderecos/solicitacoes PATCH]', e)
    return NextResponse.json({ error: 'Erro ao processar solicitação' }, { status: 500 })
  }
}