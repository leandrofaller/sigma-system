import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const year = new Date().getFullYear()
  const startOfYear = new Date(year, 0, 1)

  try {
    const all = await prisma.ordemMissao.findMany({
      select: { numero: true },
    })

    let max = 0
    for (const o of all) {
      const match = o.numero.match(/OM n[oº]\s*(\d+)/)
      if (match) max = Math.max(max, parseInt(match[1]))
    }

    const next = String(max + 1).padStart(3, '0')
    return NextResponse.json({ numero: `OM nº ${next}/${year}/AIP/SEJUS/RO` })
  } catch (error) {
    console.error('[PROXIMO NUMERO] Erro:', error)
    const startOfYear2 = new Date(year, 0, 1)
    const count = await prisma.ordemMissao.count({ where: { createdAt: { gte: startOfYear2 } } }).catch(() => 0)
    return NextResponse.json({ numero: `OM nº ${String(count + 1).padStart(3, '0')}/${year}/AIP/SEJUS/RO` })
  }
}
