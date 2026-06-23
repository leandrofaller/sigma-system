import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ count: 0 })

  const userId = (session.user as any).id

  try {
    const count = await prisma.ordemMissaoParticipante.count({
      where: {
        userId,
        cienciaEm: null,
        ordem: { status: 'ATIVA' },
      },
    })

    // Retorna também o número da ordem mais recente para exibir na notificação
    const latest = count > 0
      ? await prisma.ordemMissaoParticipante.findFirst({
          where: { userId, cienciaEm: null, ordem: { status: 'ATIVA' } },
          orderBy: { createdAt: 'desc' },
          select: { ordem: { select: { numero: true, titulo: true } } },
        })
      : null

    return NextResponse.json({
      count,
      latest: latest?.ordem ?? null,
    })
  } catch {
    return NextResponse.json({ count: 0, latest: null })
  }
}
