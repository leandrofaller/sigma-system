import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { fetchVinculosMapaPorGeo } from '@/lib/geo-vinculo-resumo'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const role = (session.user as { role?: string }).role
  if (!role || !['SUPER_ADMIN', 'ADMIN', 'OPERATOR'].includes(role)) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const ibgeParam = searchParams.get('ibge')
  const ibge = ibgeParam ? parseInt(ibgeParam, 10) : null

  try {
    const vinculos = await fetchVinculosMapaPorGeo({
      municipio: searchParams.get('municipio') ?? undefined,
      ibge: ibge != null && !isNaN(ibge) ? ibge : null,
      unidadeId: searchParams.get('unidadeId') ?? undefined,
      unidadeAip: searchParams.get('unidadeAip') ?? undefined,
      limit: searchParams.get('limit') ? parseInt(searchParams.get('limit')!, 10) : 30,
    })
    return NextResponse.json({ vinculos })
  } catch (e) {
    console.error('[geo-vinculo/vinculos]', e)
    return NextResponse.json({ error: 'Erro ao buscar vínculos' }, { status: 500 })
  }
}