import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { auth } from '@/lib/auth'

const LAYOUT_KEY = 'aip_ficha_layout'

// Layout Padrão
const DEFAULT_LAYOUT = {
  photoStyle: 'avatar', // 'avatar' ou 'full'
  photoFit: 'cover', // 'cover', 'cover-top', 'contain'
  sections: [
    { id: 'dados_pessoais', title: 'Dados Pessoais (SIPE)', visible: true },
    { id: 'situacao_prisional', title: 'Situação Prisional (SIPE)', visible: true },
    { id: 'endereco_residencial', title: 'Endereço Residencial (SIPE)', visible: true },
    { id: 'advogados', title: 'Advogados (SIPE)', visible: true },
    { id: 'dados_inteligencia', title: 'Dados de Inteligência', visible: true },
    { id: 'visitantes', title: 'Visitantes Cadastrados', visible: true },
    { id: 'vinculos', title: 'Vínculos no Sistema', visible: true }
  ]
}

export async function GET() {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    const config = await prisma.systemConfig.findUnique({
      where: { key: LAYOUT_KEY }
    })

    if (!config) {
      return NextResponse.json(DEFAULT_LAYOUT)
    }

    return NextResponse.json(config.value)
  } catch (error) {
    console.error('[AIP Layout] Erro ao buscar layout:', error)
    return NextResponse.json({ error: 'Erro interno ao buscar layout' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    const user = session.user as any
    if (user.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
    }

    const body = await req.json()

    // Validar corpo básico
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Corpo inválido' }, { status: 400 })
    }

    const updated = await prisma.systemConfig.upsert({
      where: { key: LAYOUT_KEY },
      update: {
        value: body,
        updatedBy: user.id
      },
      create: {
        key: LAYOUT_KEY,
        value: body,
        updatedBy: user.id,
        description: 'Layout da Ficha do Apenado no AIP'
      }
    })

    return NextResponse.json({ success: true, layout: updated.value })
  } catch (error) {
    console.error('[AIP Layout] Erro ao salvar layout:', error)
    return NextResponse.json({ error: 'Erro interno ao salvar layout' }, { status: 500 })
  }
}
