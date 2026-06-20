import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { containsNormalized } from '@/lib/search'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const role = (session.user as any).role
  if (role !== 'SUPER_ADMIN' && role !== 'OPERATOR' && role !== 'ADMIN') {
    return NextResponse.json({ error: 'Acesso restrito' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const q = searchParams.get('q')?.trim() ?? ''

  const visitantes = await prisma.aIPFotoVisitante.findMany({
    include: {
      apenado: {
        select: { id: true, nome: true, photoPath: true },
      },
    },
    orderBy: { sincronizadoEm: 'desc' },
  })

  let resultado = visitantes

  if (q) {
    resultado = visitantes.filter(
      (v) =>
        containsNormalized(v.nomeVisitante, q) ||
        containsNormalized(v.cpfVisitante, q)
    )
  }

  return NextResponse.json({
    visitantes: resultado.map((v) => ({
      id: v.id,
      visitanteId: v.visitanteId,
      nomeVisitante: v.nomeVisitante,
      cpfVisitante: v.cpfVisitante,
      parentescoVisitante: v.parentescoVisitante,
      ativoVisitante: v.ativoVisitante,
      photoPath: v.photoPath,
      descricao: v.descricao,
      apenado: v.apenado,
    })),
    total: resultado.length,
  })
}
