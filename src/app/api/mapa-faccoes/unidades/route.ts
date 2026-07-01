import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { loadUnidadesCatalog } from '@/lib/unidades-enderecos-catalog'

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const role = (session.user as { role?: string }).role
  if (!role || !['SUPER_ADMIN', 'ADMIN', 'OPERATOR'].includes(role)) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }

  // Carrega as unidades oficiais da Lista de Endereços (estáticas + customizadas ativas)
  const catalog = await loadUnidadesCatalog()
  const set = new Set<string>()
  for (const item of catalog) {
    if (item.unidade) set.add(item.unidade)
  }

  const unidades = Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'))

  return NextResponse.json({ unidades })
}