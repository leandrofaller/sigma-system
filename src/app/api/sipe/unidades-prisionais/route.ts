import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { unaccentParam } from '@/lib/search'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  
  // Apenas Superadmin pode acessar os dados isolados de unidades prisionais
  if ((session.user as any).role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Acesso restrito ao Superadmin' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const q = unaccentParam(searchParams.get('q'))
  const faccaoId = searchParams.get('faccaoId')
  const unidade = unaccentParam(searchParams.get('unidade'))
  const situacao = unaccentParam(searchParams.get('situacao'))
  const page = Math.max(1, parseInt(searchParams.get('page') || '1'))
  const limit = Math.max(1, Math.min(500, parseInt(searchParams.get('limit') || '20')))
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
      OR COALESCE(alcunhas::text, '') ILIKE $${idx}
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
  const countQuery = `SELECT COUNT(*)::int AS total FROM sipe_apenados_unidades_prisionais ${whereClause}`
  const idsQuery = `SELECT id FROM sipe_apenados_unidades_prisionais ${whereClause} ORDER BY nome ASC LIMIT $${idx} OFFSET $${idx + 1}`

  const [countResult, idRows] = await Promise.all([
    prisma.$queryRawUnsafe<{ total: number }[]>(countQuery, ...params),
    prisma.$queryRawUnsafe<{ id: string }[]>(idsQuery, ...params, limit, skip),
  ])

  const total = countResult[0]?.total ?? 0
  const ids = idRows.map(r => r.id)

  // Busca os registros completos com includes relevantes
  const dbApenados = ids.length > 0
    ? await prisma.sipeApenadoUnidadePrisional.findMany({
        where: { id: { in: ids } },
        include: {
          faccao: true,
        },
        orderBy: { nome: 'asc' },
      })
    : []

  const apenados = dbApenados.map((ap: any) => {
    const advs = Array.isArray(ap.advogados) ? ap.advogados : []
    const vists = Array.isArray(ap.visitantes) ? ap.visitantes : []
    const alcunhas = Array.isArray(ap.alcunhas) ? ap.alcunhas : []
    const processos = Array.isArray(ap.processos) ? ap.processos : []
    const historicos = Array.isArray(ap.historicos) ? ap.historicos : []
    const fotosComplementares = Array.isArray(ap.fotosComplementares) ? ap.fotosComplementares : []

    return {
      ...ap,
      alcunhas,
      processos,
      historicos,
      fotosComplementares,
      vinculosAdvogado: advs.map((adv: any) => ({
        advogado: {
          id: adv.id,
          nome: adv.nome,
          oab: adv.oab || null
        }
      })),
      vinculosVisitante: vists.map((v: any) => ({
        visitante: {
          id: v.id,
          nome: v.nome,
          cpf: v.cpf || null,
          parentesco: v.parentesco || null,
          photoPath: v.photoPath || null
        },
        ativo: v.ativo !== false
      }))
    }
  })

  return NextResponse.json({ apenados, total, page, totalPages: Math.ceil(total / limit) })
}
