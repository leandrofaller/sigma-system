import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import {
  isAdminRole,
  loadUnidadeById,
  upsertUnidadeOverride,
  type UnidadeEnderecoInput,
} from '@/lib/unidades-enderecos-catalog'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const role = (session.user as { role?: string }).role
  if (!role || !['SUPER_ADMIN', 'ADMIN', 'OPERATOR'].includes(role)) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }

  const { id } = await params
  try {
    const unidade = await loadUnidadeById(id)
    if (!unidade) return NextResponse.json({ error: 'Unidade não encontrada' }, { status: 404 })
    return NextResponse.json({ unidade })
  } catch (e) {
    console.error('[unidades-enderecos/[id] GET]', e)
    return NextResponse.json({ error: 'Erro ao carregar unidade' }, { status: 500 })
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const user = session.user as { id?: string; role?: string }
  if (!isAdminRole(user.role)) {
    return NextResponse.json({ error: 'Apenas administradores podem salvar diretamente' }, { status: 403 })
  }
  if (!user.id) return NextResponse.json({ error: 'Usuário inválido' }, { status: 400 })

  const { id } = await params
  const body = (await req.json()) as UnidadeEnderecoInput

  try {
    await upsertUnidadeOverride(id, body, user.id)

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'UNIDADE_ENDERECO_ATUALIZADA',
        entity: 'UnidadeEnderecoOverride',
        entityId: id,
        details: { ...body },
      },
    })

    const unidade = await loadUnidadeById(id)
    return NextResponse.json({ unidade, aplicado: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Erro ao salvar'
    if (msg === 'UNIDADE_NAO_ENCONTRADA') {
      return NextResponse.json({ error: 'Unidade não encontrada' }, { status: 404 })
    }
    if (msg.includes('obrigat') || msg.includes('inválid')) {
      return NextResponse.json({ error: msg }, { status: 400 })
    }
    console.error('[unidades-enderecos/[id] PUT]', e)
    return NextResponse.json({ error: 'Erro ao salvar unidade' }, { status: 500 })
  }
}