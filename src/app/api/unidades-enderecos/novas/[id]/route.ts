import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import {
  aprovarNovaUnidade,
  isAdminRole,
  rejeitarNovaUnidade,
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
  const body = (await req.json()) as { acao?: string; motivo?: string }
  const acao = body.acao?.toUpperCase()

  if (acao !== 'APROVAR' && acao !== 'REJEITAR') {
    return NextResponse.json({ error: 'Ação inválida. Use APROVAR ou REJEITAR' }, { status: 400 })
  }

  try {
    const resultado =
      acao === 'APROVAR'
        ? await aprovarNovaUnidade(id, user.id)
        : await rejeitarNovaUnidade(id, user.id, body.motivo)

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: acao === 'APROVAR' ? 'UNIDADE_ENDERECO_NOVA_APROVADA' : 'UNIDADE_ENDERECO_NOVA_REJEITADA',
        entity: 'UnidadeEnderecoCustom',
        entityId: id,
        details: { motivo: body.motivo ?? null },
      },
    })

    return NextResponse.json({
      unidade: acao === 'APROVAR' ? resultado : undefined,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Erro'
    if (msg === 'NOVA_UNIDADE_NAO_ENCONTRADA') {
      return NextResponse.json({ error: 'Solicitação não encontrada' }, { status: 404 })
    }
    if (msg === 'NOVA_UNIDADE_JA_REVISADA') {
      return NextResponse.json({ error: 'Solicitação já foi revisada' }, { status: 409 })
    }
    console.error('[unidades-enderecos/novas PATCH]', e)
    return NextResponse.json({ error: 'Erro ao processar solicitação' }, { status: 500 })
  }
}