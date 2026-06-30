import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { UNIDADES_ENDERECOS_RO } from '@/lib/unidades-enderecos-ro'

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const role = (session.user as { role?: string }).role
  if (!role || !['SUPER_ADMIN', 'ADMIN', 'OPERATOR'].includes(role)) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }

  const [sipeUnidades, mapaUnidades, aipUnidades] = await Promise.all([
    prisma.sipeApenadoUnidadePrisional.groupBy({
      by: ['unidade'],
      where: { unidade: { not: null } },
    }),
    prisma.mapaFaccaoVinculo.groupBy({ by: ['unidadePrisional'] }),
    prisma.aIPApenado.groupBy({
      by: ['unidade'],
      where: { unidade: { not: null } },
    }),
  ])

  const set = new Set<string>()
  for (const u of sipeUnidades) if (u.unidade) set.add(u.unidade)
  for (const u of mapaUnidades) set.add(u.unidadePrisional)
  for (const u of aipUnidades) if (u.unidade) set.add(u.unidade)
  for (const u of UNIDADES_ENDERECOS_RO) set.add(u.unidade)

  const unidades = Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'))

  return NextResponse.json({ unidades })
}