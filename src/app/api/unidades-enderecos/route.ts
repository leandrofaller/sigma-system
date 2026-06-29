import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { loadUnidadesCatalog, listComarcasFromCatalog } from '@/lib/unidades-enderecos-catalog'

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const role = (session.user as { role?: string }).role
  if (!role || !['SUPER_ADMIN', 'ADMIN', 'OPERATOR'].includes(role)) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }

  try {
    const unidades = await loadUnidadesCatalog()
    return NextResponse.json({
      unidades,
      comarcas: listComarcasFromCatalog(unidades),
      total: unidades.length,
    })
  } catch (e) {
    console.error('[unidades-enderecos GET]', e)
    return NextResponse.json({ error: 'Erro ao carregar unidades' }, { status: 500 })
  }
}