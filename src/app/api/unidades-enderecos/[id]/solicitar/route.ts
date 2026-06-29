import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import {
  criarSolicitacaoAlteracao,
  loadUnidadeById,
  type UnidadeEnderecoInput,
} from '@/lib/unidades-enderecos-catalog'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const user = session.user as { id?: string; role?: string }
  if (!user.id || !user.role || !['SUPER_ADMIN', 'ADMIN', 'OPERATOR'].includes(user.role)) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }

  const { id } = await params
  const body = (await req.json()) as UnidadeEnderecoInput

  try {
    const solicitacao = await criarSolicitacaoAlteracao(id, body, user.id)

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'UNIDADE_ENDERECO_SOLICITACAO',
        entity: 'UnidadeEnderecoSolicitacao',
        entityId: solicitacao.id,
        details: { unidadeId: id, ...body },
      },
    })

    const unidade = await loadUnidadeById(id)
    return NextResponse.json({
      solicitacao: { id: solicitacao.id, status: solicitacao.status },
      unidade,
      mensagem: 'Alteração enviada para aprovação do administrador',
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Erro ao solicitar'
    if (msg === 'UNIDADE_NAO_ENCONTRADA') {
      return NextResponse.json({ error: 'Unidade não encontrada' }, { status: 404 })
    }
    if (msg.includes('obrigat') || msg.includes('inválid')) {
      return NextResponse.json({ error: msg }, { status: 400 })
    }
    console.error('[unidades-enderecos solicitar]', e)
    return NextResponse.json({ error: 'Erro ao enviar solicitação' }, { status: 500 })
  }
}