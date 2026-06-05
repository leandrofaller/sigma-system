import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { id } = await params

  const apenado = await prisma.sipeApenadoImportado.findUnique({
    where: { id },
    include: {
      faccao: true,
      alcunhas: true,
      processos: true,
      historicos: {
        orderBy: { datahora: 'desc' }
      },
      vinculosAdvogado: { include: { advogado: true } },
      vinculosVisitante: { include: { visitante: true } },
      fotosComplementares: true,
    },
  })

  if (!apenado) {
    return NextResponse.json({ error: 'Apenado não encontrado' }, { status: 404 })
  }

  return NextResponse.json(apenado)
}
