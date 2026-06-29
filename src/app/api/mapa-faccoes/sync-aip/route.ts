import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { syncAllAipToMapa, syncMapaVinculoFromAip } from '@/lib/mapa-faccoes-aip-sync'

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const role = (session.user as { role?: string }).role
  if (!role || !['SUPER_ADMIN', 'ADMIN', 'OPERATOR'].includes(role)) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }

  const userId = (session.user as { id: string }).id
  const body = await req.json().catch(() => ({}))

  try {
    if (body.aipApenadoId) {
      const result = await syncMapaVinculoFromAip(body.aipApenadoId, userId)
      return NextResponse.json({ success: true, ...result })
    }

    const result = await syncAllAipToMapa(userId, {
      limit: body.limit,
      cursor: body.cursor,
    })

    return NextResponse.json({ success: true, ...result })
  } catch (e) {
    console.error('[mapa-faccoes/sync-aip]', e)
    return NextResponse.json({ error: 'Erro na sincronização com AIP' }, { status: 500 })
  }
}