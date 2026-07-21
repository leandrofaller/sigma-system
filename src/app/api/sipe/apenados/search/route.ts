import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { auth } from '@/lib/auth'
import { unaccentParam } from '@/lib/search'

/**
 * GET /api/sipe/apenados/search
 * Pesquisa apenados no SIPE importado para alimentar a seleção no modal de vinculação
 */
export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  try {
    const { searchParams } = new URL(request.url)
    const q = unaccentParam(searchParams.get('q'))

    if (!q || q.length < 2) {
      return NextResponse.json({ apenados: [] })
    }

    const pattern = `%${q}%`
    const sipeIdNum = parseInt(q.replace(/\D/g, ''))

    const results = await prisma.$queryRawUnsafe<any[]>(
      `SELECT "id", "sipeId", "nome", "cpf", "rji", "unidade", "cela", "situacao", "photoPath"
       FROM "sipe_apenados_importados"
       WHERE immutable_unaccent("nome") ILIKE immutable_unaccent($1)
          OR COALESCE("cpf",'') ILIKE $1
          OR COALESCE("rji",'') ILIKE $1
          ${!isNaN(sipeIdNum) ? `OR "sipeId" = ${sipeIdNum}` : ''}
       ORDER BY "nome" ASC
       LIMIT 20`,
      pattern
    )

    return NextResponse.json({ apenados: results })
  } catch (error: any) {
    console.error('[SIPE SEARCH] Erro na busca de apenados SIPE:', error)
    return NextResponse.json(
      { error: 'Erro ao buscar apenados no SIPE' },
      { status: 500 }
    )
  }
}
