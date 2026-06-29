import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getStaticUnidadeById, isAdminRole, listarSolicitacoesPendentes } from '@/lib/unidades-enderecos-catalog'

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const role = (session.user as { role?: string }).role
  if (!isAdminRole(role)) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }

  try {
    const solicitacoes = await listarSolicitacoesPendentes()
    return NextResponse.json({
      solicitacoes: solicitacoes.map((s) => ({
        ...s,
        unidadeAtual: getStaticUnidadeById(s.unidadeId),
      })),
    })
  } catch (e) {
    console.error('[unidades-enderecos/solicitacoes GET]', e)
    return NextResponse.json({ error: 'Erro ao listar solicitações' }, { status: 500 })
  }
}