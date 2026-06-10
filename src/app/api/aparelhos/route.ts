import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { createAuditLog } from '@/lib/audit'
import { containsNormalizedText, normalizeSearchText } from '@/lib/search'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const page = parseInt(searchParams.get('page') || '1', 10)
  const limit = parseInt(searchParams.get('limit') || '50', 10)
  const search = normalizeSearchText(searchParams.get('search'))
  const unidade = normalizeSearchText(searchParams.get('unidade'))
  const municipio = normalizeSearchText(searchParams.get('municipio'))
  const marca = normalizeSearchText(searchParams.get('marca'))
  const dataInicio = searchParams.get('dataInicio') || ''
  const dataFim = searchParams.get('dataFim') || ''

  const skip = (page - 1) * limit
  const where: any = {}

  if (dataInicio || dataFim) {
    where.dataArrecadacao = {}
    if (dataInicio) {
      where.dataArrecadacao.gte = new Date(dataInicio)
    }
    if (dataFim) {
      const dateFimObj = new Date(dataFim)
      dateFimObj.setHours(23, 59, 59, 999)
      where.dataArrecadacao.lte = dateFimObj
    }
  }

  try {
    const filteredAparelhos = (await prisma.aparelhoApreendido.findMany({
      where,
      orderBy: { dataArrecadacao: 'desc' },
    })).filter((item) => {
      if (
        search &&
        !containsNormalizedText(item.responsavel, search) &&
        !containsNormalizedText(item.celaPavilhao, search) &&
        !containsNormalizedText(item.processoSei, search) &&
        !containsNormalizedText(item.marca, search) &&
        !containsNormalizedText(item.municipio, search) &&
        !containsNormalizedText(item.unidadePrisional, search) &&
        !containsNormalizedText(item.unidadeExterna, search) &&
        !containsNormalizedText(item.localExterno, search)
      ) {
        return false
      }

      if (unidade && !containsNormalizedText(item.unidadePrisional, unidade)) {
        return false
      }
      if (municipio && !containsNormalizedText(item.municipio, municipio)) {
        return false
      }
      if (marca && !containsNormalizedText(item.marca, marca)) {
        return false
      }

      return true
    })

    const total = filteredAparelhos.length
    const totalCelulares = filteredAparelhos.filter((item) => item.marca && item.marca.trim() !== '').length
    const aparelhos = filteredAparelhos.slice(skip, skip + limit)

    const marcasMaisComuns = Object.entries(
      filteredAparelhos.reduce<Record<string, number>>((acc, item) => {
        const key = item.marca?.trim() || 'Outras'
        acc[key] = (acc[key] || 0) + 1
        return acc
      }, {})
    )
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)

    const unidadesMaisComuns = Object.entries(
      filteredAparelhos.reduce<Record<string, number>>((acc, item) => {
        const key = item.unidadePrisional?.trim() || 'Nao Informada'
        acc[key] = (acc[key] || 0) + 1
        return acc
      }, {})
    )
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)

    return NextResponse.json({
      data: aparelhos,
      pagination: {
        total,
        totalCelulares,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
      stats: {
        marcas: marcasMaisComuns.map(([name, count]) => ({ name, count })),
        unidades: unidadesMaisComuns.map(([name, count]) => ({ name, count })),
      }
    })
  } catch (error: any) {
    console.error('Error fetching devices:', error)
    return NextResponse.json({ error: 'Erro ao buscar aparelhos' }, { status: 500 })
  }
}

function parseFormDate(dateStr: string | null | undefined): Date | null {
  if (!dateStr || dateStr.trim() === '') return null
  const cleanStr = dateStr.trim()

  const parts = cleanStr.split('-')
  if (parts.length === 3 && parts[0].length === 4) {
    const year = parseInt(parts[0], 10)
    const month = parseInt(parts[1], 10) - 1
    const day = parseInt(parts[2], 10)
    return new Date(Date.UTC(year, month, day))
  }

  const partsSlash = cleanStr.split('/')
  if (partsSlash.length === 3) {
    const day = parseInt(partsSlash[0], 10)
    const month = parseInt(partsSlash[1], 10) - 1
    const year = parseInt(partsSlash[2], 10)
    return new Date(Date.UTC(year, month, day))
  }

  const t = Date.parse(cleanStr)
  return isNaN(t) ? null : new Date(t)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })
  }

  try {
    const body = await req.json()
    const {
      timestamp,
      responsavel,
      dataArrecadacao,
      dataRecebimento,
      municipio,
      unidadePrisional,
      celaPavilhao,
      unidadeExterna,
      localExterno,
      processoSei,
      marca,
      smartwatch,
      chip,
    } = body

    if (!responsavel || !municipio || !unidadePrisional) {
      return NextResponse.json({ error: 'Campos obrigatorios ausentes' }, { status: 400 })
    }

    const aparelho = await prisma.aparelhoApreendido.create({
      data: {
        timestamp: timestamp ? parseFormDate(timestamp) || new Date() : new Date(),
        responsavel,
        dataArrecadacao: parseFormDate(dataArrecadacao),
        dataRecebimento: parseFormDate(dataRecebimento),
        municipio,
        unidadePrisional,
        celaPavilhao,
        unidadeExterna,
        localExterno,
        processoSei,
        marca,
        smartwatch,
        chip,
      },
    })

    await createAuditLog({
      userId: (session.user as any).id,
      action: 'CREATE_APARELHO',
      entity: 'AparelhoApreendido',
      entityId: aparelho.id,
      details: { responsavel, processoSei, marca, unidadePrisional },
    })

    return NextResponse.json(aparelho, { status: 201 })
  } catch (error: any) {
    console.error('Error creating device:', error)
    return NextResponse.json({ error: 'Erro ao criar aparelho' }, { status: 500 })
  }
}
