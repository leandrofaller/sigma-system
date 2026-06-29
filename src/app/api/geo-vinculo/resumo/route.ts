import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { buildGeoVinculoResumo } from '@/lib/geo-vinculo-resumo'

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const role = (session.user as { role?: string }).role
  if (!role || !['SUPER_ADMIN', 'ADMIN', 'OPERATOR'].includes(role)) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }

  try {
    const resumo = await buildGeoVinculoResumo()
    return NextResponse.json(resumo)
  } catch (e) {
    console.error('[geo-vinculo/resumo]', e)
    return NextResponse.json({ error: 'Erro ao gerar resumo geográfico' }, { status: 500 })
  }
}