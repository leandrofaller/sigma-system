import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { createAuditLog } from '@/lib/audit'
import { unaccentParam } from '@/lib/search'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const page = parseInt(searchParams.get('page') || '1', 10)
  const limit = parseInt(searchParams.get('limit') || '50', 10)
  const search = unaccentParam(searchParams.get('search'))
  const unidade = searchParams.get('unidade') || ''
  const municipio = searchParams.get('municipio') || ''
  const marca = unaccentParam(searchParams.get('marca'))
  const dataInicio = searchParams.get('dataInicio') || ''
  const dataFim = searchParams.get('dataFim') || ''

  const skip = (page - 1) * limit

  // Build raw SQL WHERE clause
  let whereClause = 'WHERE 1=1'
  const params: any[] = []
  let idx = 1

  if (search) {
    const pattern = `%${search}%`
    whereClause += ` AND (
      immutable_unaccent(COALESCE(responsavel,'')) ILIKE immutable_unaccent($${idx})
      OR immutable_unaccent(COALESCE("celaPavilhao",'')) ILIKE immutable_unaccent($${idx})
      OR immutable_unaccent(COALESCE("processoSei",'')) ILIKE immutable_unaccent($${idx})
      OR immutable_unaccent(COALESCE(marca,'')) ILIKE immutable_unaccent($${idx})
      OR immutable_unaccent(COALESCE(municipio,'')) ILIKE immutable_unaccent($${idx})
      OR immutable_unaccent(COALESCE("unidadePrisional",'')) ILIKE immutable_unaccent($${idx})
      OR immutable_unaccent(COALESCE("unidadeExterna",'')) ILIKE immutable_unaccent($${idx})
      OR immutable_unaccent(COALESCE("localExterno",'')) ILIKE immutable_unaccent($${idx})
    )`
    params.push(pattern)
    idx++
  }

  if (unidade) {
    whereClause += ` AND "unidadePrisional" = $${idx}`
    params.push(unidade)
    idx++
  }
  if (municipio) {
    whereClause += ` AND municipio = $${idx}`
    params.push(municipio)
    idx++
  }
  if (marca) {
    whereClause += ` AND immutable_unaccent(COALESCE(marca,'')) ILIKE immutable_unaccent($${idx})`
    params.push(`%${marca}%`)
    idx++
  }

  if (dataInicio) {
    whereClause += ` AND "dataArrecadacao" >= $${idx}`
    params.push(new Date(dataInicio))
    idx++
  }
  if (dataFim) {
    const dateFimObj = new Date(dataFim)
    dateFimObj.setHours(23, 59, 59, 999)
    whereClause += ` AND "dataArrecadacao" <= $${idx}`
    params.push(dateFimObj)
    idx++
  }

  try {
    // Count + paginated data
    const countQuery = `SELECT COUNT(*)::int AS total FROM aparelhos_apreendidos ${whereClause}`
    const dataQuery = `SELECT * FROM aparelhos_apreendidos ${whereClause} ORDER BY "dataArrecadacao" DESC NULLS LAST LIMIT $${idx} OFFSET $${idx + 1}`

    const [countResult, aparelhos] = await Promise.all([
      prisma.$queryRawUnsafe<{ total: number }[]>(countQuery, ...params),
      prisma.$queryRawUnsafe<any[]>(dataQuery, ...params, limit, skip),
    ])

    const total = countResult[0]?.total ?? 0

    // Count celulares (with marca not empty)
    const celCountQuery = `SELECT COUNT(*)::int AS total FROM aparelhos_apreendidos ${whereClause} AND marca IS NOT NULL AND marca != ''`
    const celResult = await prisma.$queryRawUnsafe<{ total: number }[]>(celCountQuery, ...params)
    const totalCelulares = celResult[0]?.total ?? 0

    // Stats: top 5 marcas and unidades (uses Prisma groupBy with same date/exact filters)
    const prismaWhere: any = {}
    if (unidade) prismaWhere.unidadePrisional = unidade
    if (municipio) prismaWhere.municipio = municipio
    if (dataInicio || dataFim) {
      prismaWhere.dataArrecadacao = {}
      if (dataInicio) prismaWhere.dataArrecadacao.gte = new Date(dataInicio)
      if (dataFim) {
        const d = new Date(dataFim); d.setHours(23,59,59,999)
        prismaWhere.dataArrecadacao.lte = d
      }
    }

    const [marcasMaisComuns, unidadesMaisComuns] = await Promise.all([
      prisma.aparelhoApreendido.groupBy({
        by: ['marca'],
        where: { ...prismaWhere, marca: { not: null } },
        _count: { marca: true },
        orderBy: { _count: { marca: 'desc' } },
        take: 5,
      }),
      prisma.aparelhoApreendido.groupBy({
        by: ['unidadePrisional'],
        where: { ...prismaWhere, unidadePrisional: { not: '' } },
        _count: { unidadePrisional: true },
        orderBy: { _count: { unidadePrisional: 'desc' } },
        take: 5,
      }),
    ])

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
        marcas: marcasMaisComuns.map(m => ({ name: m.marca || 'Outras', count: m._count.marca })),
        unidades: unidadesMaisComuns.map(u => ({ name: u.unidadePrisional, count: u._count.unidadePrisional })),
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
  
  // Se for YYYY-MM-DD
  const parts = cleanStr.split('-')
  if (parts.length === 3 && parts[0].length === 4) {
    const year = parseInt(parts[0], 10)
    const month = parseInt(parts[1], 10) - 1
    const day = parseInt(parts[2], 10)
    return new Date(Date.UTC(year, month, day))
  }
  
  // Se for DD/MM/YYYY
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
