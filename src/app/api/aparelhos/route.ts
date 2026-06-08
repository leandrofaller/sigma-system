import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { createAuditLog } from '@/lib/audit'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const page = parseInt(searchParams.get('page') || '1', 10)
  const limit = parseInt(searchParams.get('limit') || '50', 10)
  const search = searchParams.get('search') || ''
  const unidade = searchParams.get('unidade') || ''
  const municipio = searchParams.get('municipio') || ''
  const marca = searchParams.get('marca') || ''
  const dataInicio = searchParams.get('dataInicio') || ''
  const dataFim = searchParams.get('dataFim') || ''

  const skip = (page - 1) * limit

  // Construindo a cláusula where do Prisma
  const where: any = {}

  // Busca textual genérica
  if (search) {
    where.OR = [
      { responsavel: { contains: search, mode: 'insensitive' } },
      { celaPavilhao: { contains: search, mode: 'insensitive' } },
      { processoSei: { contains: search, mode: 'insensitive' } },
      { marca: { contains: search, mode: 'insensitive' } },
      { municipio: { contains: search, mode: 'insensitive' } },
      { unidadePrisional: { contains: search, mode: 'insensitive' } },
      { unidadeExterna: { contains: search, mode: 'insensitive' } },
      { localExterno: { contains: search, mode: 'insensitive' } },
    ]
  }

  // Filtros específicos
  if (unidade) {
    where.unidadePrisional = unidade
  }
  if (municipio) {
    where.municipio = municipio
  }
  if (marca) {
    where.marca = { contains: marca, mode: 'insensitive' }
  }

  // Filtros por período de arrecadação
  if (dataInicio || dataFim) {
    where.dataArrecadacao = {}
    if (dataInicio) {
      where.dataArrecadacao.gte = new Date(dataInicio)
    }
    if (dataFim) {
      // Ajusta para o final do dia
      const dateFimObj = new Date(dataFim)
      dateFimObj.setHours(23, 59, 59, 999)
      where.dataArrecadacao.lte = dateFimObj
    }
  }

  try {
    const [total, aparelhos] = await Promise.all([
      prisma.aparelhoApreendido.count({ where }),
      prisma.aparelhoApreendido.findMany({
        where,
        orderBy: { dataArrecadacao: 'desc' },
        skip,
        take: limit,
      }),
    ])

    // Agregações básicas para estatísticas (marcas mais comuns e locais)
    // Feito de forma otimizada para a interface principal
    const [marcasMaisComuns, unidadesMaisComuns] = await Promise.all([
      prisma.aparelhoApreendido.groupBy({
        by: ['marca'],
        where: { marca: { not: null } },
        _count: { marca: true },
        orderBy: { _count: { marca: 'desc' } },
        take: 5,
      }),
      prisma.aparelhoApreendido.groupBy({
        by: ['unidadePrisional'],
        where: { unidadePrisional: { not: '' } },
        _count: { unidadePrisional: true },
        orderBy: { _count: { unidadePrisional: 'desc' } },
        take: 5,
      }),
    ])

    return NextResponse.json({
      data: aparelhos,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
      stats: {
        marcas: marcasMaisComuns.map(m => ({ name: m.marca || 'Outras', count: m._count.marca })),
        unidades: unidadesMaisComuns.map(u => ({ name: u.unidadePrisional, count: u._count.unidadePrisional })),
      }
    })
  } catch (error: any) {
    console.error('Error fetching devices:', error)
    return NextResponse.json({ error: 'Erro ao buscar aparelhos' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
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
      return NextResponse.json({ error: 'Campos obrigatórios ausentes' }, { status: 400 })
    }

    const aparelho = await prisma.aparelhoApreendido.create({
      data: {
        timestamp: timestamp ? new Date(timestamp) : new Date(),
        responsavel,
        dataArrecadacao: dataArrecadacao ? new Date(dataArrecadacao) : null,
        dataRecebimento: dataRecebimento ? new Date(dataRecebimento) : null,
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

    // Log de auditoria
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
