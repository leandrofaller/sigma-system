import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ ordens: [] })

  const userId = (session.user as any).id

  try {
    const agora = new Date()
    const em24h = new Date(agora.getTime() + 24 * 60 * 60 * 1000)

    const participacoes = await prisma.ordemMissaoParticipante.findMany({
      where: {
        userId,
        ordem: {
          status: 'ATIVA',
          prazo: { gt: agora, lte: em24h },
        },
      },
      include: {
        ordem: { select: { id: true, numero: true, titulo: true, prazo: true } },
      },
    })

    const ordens = participacoes.map(p => p.ordem)

    return NextResponse.json({ ordens })
  } catch {
    return NextResponse.json({ ordens: [] })
  }
}
