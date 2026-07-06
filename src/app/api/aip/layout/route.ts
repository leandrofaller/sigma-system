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

    const [config, watermarkEnabled, watermarkSize, watermarkColor, watermarkOpacity, watermarkRotation, watermarkPosition] = await Promise.all([
      prisma.systemConfig.findUnique({ where: { key: LAYOUT_KEY } }),
      prisma.systemConfig.findUnique({ where: { key: 'watermark_enabled' } }),
      prisma.systemConfig.findUnique({ where: { key: 'watermark_font_size' } }),
      prisma.systemConfig.findUnique({ where: { key: 'watermark_color' } }),
      prisma.systemConfig.findUnique({ where: { key: 'watermark_opacity' } }),
      prisma.systemConfig.findUnique({ where: { key: 'watermark_rotation' } }),
      prisma.systemConfig.findUnique({ where: { key: 'watermark_position' } }),
    ])

    const layoutVal = config ? (config.value as any) : DEFAULT_LAYOUT

    const watermark = {
      enabled: watermarkEnabled ? (watermarkEnabled.value as boolean) : true,
      fontSize: watermarkSize ? (watermarkSize.value as number) : 60,
      color: watermarkColor ? (watermarkColor.value as string) : '#cbd5e1',
      opacity: watermarkOpacity ? (watermarkOpacity.value as number) : 0.15,
      rotation: watermarkRotation ? (watermarkRotation.value as number) : -45,
      position: watermarkPosition ? (watermarkPosition.value as string) : 'repeat',
    }

    // Se o layoutVal for um objeto simples, mesclamos a propriedade watermark
    const responseBody = typeof layoutVal === 'object' && layoutVal !== null
      ? { ...layoutVal, watermark }
      : { ...DEFAULT_LAYOUT, watermark }

    return NextResponse.json(responseBody)
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
