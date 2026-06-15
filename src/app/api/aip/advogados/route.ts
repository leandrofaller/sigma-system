import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { unaccentParam } from '@/lib/search'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const role = (session.user as any).role
  if (role !== 'SUPER_ADMIN' && role !== 'OPERATOR' && role !== 'ADMIN') {
    return NextResponse.json({ error: 'Acesso restrito' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const q = unaccentParam(searchParams.get('q'))
  const unidade = unaccentParam(searchParams.get('unidade'))
  const faccao = searchParams.get('faccao') || ''
  const page = parseInt(searchParams.get('page') || '1')
  const limit = parseInt(searchParams.get('limit') || '20')
  const skip = (page - 1) * limit

  // Para o AIP, nós SEMPRE restringimos as junções aos apenados cadastrados na tabela aip_apenados (AIPApenado)
  const fromClause = `
    FROM sipe_advogados a
    INNER JOIN sipe_vinculos_advogados va ON va."advogadoId" = a.id AND va.ativo = true
    INNER JOIN sipe_apenados_importados ap ON va."apenadoId" = ap.id
    INNER JOIN aip_apenados aip ON aip."sipeApenadoId" = ap."sipeId"
  `

  let whereClause = 'WHERE 1=1'
  const params: any[] = []
  let idx = 1

  if (q) {
    const pattern = `%${q}%`
    whereClause += ` AND (
      immutable_unaccent(a.nome) ILIKE immutable_unaccent($${idx})
      OR COALESCE(a.oab,'') ILIKE $${idx}
      OR COALESCE(a.cpf,'') ILIKE $${idx}
    )`
    params.push(pattern)
    idx++
  }

  if (unidade) {
    whereClause += ` AND immutable_unaccent(COALESCE(aip.unidade,'')) ILIKE immutable_unaccent($${idx})`
    params.push(`%${unidade}%`)
    idx++
  }

  if (faccao === 'qualquer') {
    whereClause += ` AND ap."faccaoId" IS NOT NULL`
  } else if (faccao) {
    whereClause += ` AND ap."faccaoId" = $${idx}`
    params.push(faccao)
    idx++
  }

  // Count + paginated IDs
  const countQuery = `SELECT COUNT(DISTINCT a.id)::int AS total ${fromClause} ${whereClause}`
  const idsQuery = `SELECT DISTINCT a.id, a.nome ${fromClause} ${whereClause} ORDER BY a.nome ASC LIMIT $${idx} OFFSET $${idx + 1}`

  const [countResult, idRows] = await Promise.all([
    prisma.$queryRawUnsafe<{ total: number }[]>(countQuery, ...params),
    prisma.$queryRawUnsafe<{ id: string }[]>(idsQuery, ...params, limit, skip),
  ])

  const total = countResult[0]?.total ?? 0
  const ids = idRows.map(r => r.id)

  // Filtro no Prisma: apenas apenados no AIP
  const vinculoWhere: any = {
    ativo: true,
    apenado: {
      aipApenado: { isNot: null }
    }
  }

  const apenadoFilter: any = {}
  if (unidade) {
    apenadoFilter.unidade = { contains: unidade, mode: 'insensitive' as const }
  }
  if (faccao === 'qualquer') {
    apenadoFilter.faccaoId = { not: null }
  } else if (faccao) {
    apenadoFilter.faccaoId = faccao
  }

  if (unidade || faccao) {
    vinculoWhere.apenado = {
      ...vinculoWhere.apenado,
      ...apenadoFilter
    }
  }

  // Buscar registros completos com o Prisma
  const advogados = ids.length > 0
    ? await prisma.sipeAdvogado.findMany({
        where: { id: { in: ids } },
        include: {
          vinculos: {
            where: vinculoWhere,
            include: {
              apenado: {
                include: { faccao: true, alcunhas: true },
              },
            },
          },
        },
        orderBy: { nome: 'asc' },
      })
    : []

  return NextResponse.json({
    advogados,
    total,
    page,
    totalPages: Math.ceil(total / limit)
  })
}
