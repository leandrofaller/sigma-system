import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const userId = (session.user as any).id
  const { id } = await params

  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    req.headers.get('x-real-ip') ||
    'desconhecido'

  try {
    const participante = await prisma.ordemMissaoParticipante.findUnique({
      where: { ordemId_userId: { ordemId: id, userId } },
    })

    if (!participante) {
      return NextResponse.json({ error: 'Você não é participante desta ordem de missão' }, { status: 403 })
    }

    if (participante.cienciaEm) {
      return NextResponse.json({ error: 'Ciência já registrada anteriormente' }, { status: 409 })
    }

    const updated = await prisma.ordemMissaoParticipante.update({
      where: { ordemId_userId: { ordemId: id, userId } },
      data: { cienciaEm: new Date(), cienciaIp: ip },
      include: { user: { select: { id: true, name: true, role: true } } },
    })

    return NextResponse.json({ participante: updated })
  } catch (error) {
    console.error('[CIENCIA] Erro ao registrar ciência:', error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
