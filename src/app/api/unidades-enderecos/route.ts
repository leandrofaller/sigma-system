import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import {
  criarUnidade,
  isAdminRole,
  loadUnidadesCatalog,
  listComarcasFromCatalog,
  type UnidadeEnderecoInput,
} from '@/lib/unidades-enderecos-catalog'

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const role = (session.user as { role?: string }).role
  if (!role || !['SUPER_ADMIN', 'ADMIN', 'OPERATOR'].includes(role)) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }

  try {
    const unidades = await loadUnidadesCatalog()
    return NextResponse.json({
      unidades,
      comarcas: listComarcasFromCatalog(unidades),
      total: unidades.length,
    })
  } catch (e) {
    console.error('[unidades-enderecos GET]', e)
    return NextResponse.json({ error: 'Erro ao carregar unidades' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const user = session.user as { id?: string; role?: string }
  const role = user.role
  if (!role || !['SUPER_ADMIN', 'ADMIN', 'OPERATOR'].includes(role)) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }
  if (!user.id) return NextResponse.json({ error: 'Usuário inválido' }, { status: 400 })

  const body = (await req.json()) as UnidadeEnderecoInput
  const asAdmin = isAdminRole(role)

  try {
    const unidade = await criarUnidade(body, user.id, asAdmin)

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: asAdmin ? 'UNIDADE_ENDERECO_CRIADA' : 'UNIDADE_ENDERECO_CRIACAO_SOLICITADA',
        entity: 'UnidadeEnderecoCustom',
        entityId: unidade.id,
        details: { ...body, status: asAdmin ? 'ATIVA' : 'PENDENTE' },
      },
    })

    return NextResponse.json({
      unidade,
      pendente: !asAdmin,
      aplicado: asAdmin,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Erro ao criar unidade'
    if (msg.includes('obrigat') || msg.includes('inválid')) {
      return NextResponse.json({ error: msg }, { status: 400 })
    }
    console.error('[unidades-enderecos POST]', e)
    return NextResponse.json({ error: 'Erro ao criar unidade' }, { status: 500 })
  }
}