import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { unaccentParam } from '@/lib/search'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const q = unaccentParam(searchParams.get('q'))
  const faccaoId = searchParams.get('faccaoId')
  const unidade = unaccentParam(searchParams.get('unidade'))
  const situacao = unaccentParam(searchParams.get('situacao'))
  const page = parseInt(searchParams.get('page') || '1')
  const limit = parseInt(searchParams.get('limit') || '20')
  const skip = (page - 1) * limit

  // Build raw SQL WHERE clause with immutable_unaccent
  let whereClause = 'WHERE 1=1'
  const params: any[] = []
  let idx = 1

  if (faccaoId) {
    whereClause += ` AND "faccaoId" = $${idx}`
    params.push(faccaoId)
    idx++
  }

  if (q) {
    const pattern = `%${q}%`
    whereClause += ` AND (
      immutable_unaccent(nome) ILIKE immutable_unaccent($${idx})
      OR COALESCE(cpf,'') ILIKE $${idx}
      OR COALESCE(rg,'') ILIKE $${idx}
      OR id IN (SELECT "apenadoId" FROM sipe_alcunhas WHERE immutable_unaccent(alcunha) ILIKE immutable_unaccent($${idx}))
    )`
    params.push(pattern)
    idx++
  }

  if (unidade) {
    whereClause += ` AND immutable_unaccent(COALESCE(unidade,'')) ILIKE immutable_unaccent($${idx})`
    params.push(`%${unidade}%`)
    idx++
  }

  if (situacao) {
    whereClause += ` AND immutable_unaccent(COALESCE(situacao,'')) ILIKE immutable_unaccent($${idx})`
    params.push(`%${situacao}%`)
    idx++
  }

  // Count + paginated IDs via raw SQL
  const countQuery = `SELECT COUNT(*)::int AS total FROM sipe_apenados_importados ${whereClause}`
  const idsQuery = `SELECT id FROM sipe_apenados_importados ${whereClause} ORDER BY nome ASC LIMIT $${idx} OFFSET $${idx + 1}`

  const [countResult, idRows] = await Promise.all([
    prisma.$queryRawUnsafe<{ total: number }[]>(countQuery, ...params),
    prisma.$queryRawUnsafe<{ id: string }[]>(idsQuery, ...params, limit, skip),
  ])

  const total = countResult[0]?.total ?? 0
  const ids = idRows.map(r => r.id)

  // Fetch full records with Prisma includes (preserves relations and types)
  const apenados = ids.length > 0
    ? await prisma.sipeApenadoImportado.findMany({
        where: { id: { in: ids } },
        include: {
          faccao: true,
          alcunhas: true,
          processos: true,
          historicos: { orderBy: { datahora: 'desc' } },
          vinculosAdvogado: { include: { advogado: true } },
          vinculosVisitante: { include: { visitante: true } },
          apenado: { select: { photoPath: true } },
        },
        orderBy: { nome: 'asc' },
      })
    : []

  return NextResponse.json({ apenados, total, page, totalPages: Math.ceil(total / limit) })
}
