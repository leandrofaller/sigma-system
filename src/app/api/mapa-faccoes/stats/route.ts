import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { buildMapaStats } from '@/lib/mapa-faccoes-service'

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const role = (session.user as { role?: string }).role
  if (!role || !['SUPER_ADMIN', 'ADMIN', 'OPERATOR'].includes(role)) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }

  try {
    const stats = await buildMapaStats()
    return NextResponse.json(stats)
  } catch (e) {
    console.error('[mapa-faccoes/stats]', e)
    return NextResponse.json({ error: 'Erro ao carregar estatísticas' }, { status: 500 })
  }
}