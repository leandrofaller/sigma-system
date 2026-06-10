import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { containsNormalizedText, normalizeSearchText } from '@/lib/search'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const q = normalizeSearchText(searchParams.get('q'))

  // Buscar todos os vínculos de visitantes do SIPE
  const vinculos = await prisma.sipeVinculoVisitante.findMany({
    include: {
      visitante: true,
      apenado: {
        select: {
          id: true,
          nome: true,
          photoPath: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  })

  let resultado = vinculos

  if (q) {
    resultado = vinculos.filter(
      (v) =>
        containsNormalizedText(v.visitante.nome, q) ||
        containsNormalizedText(v.visitante.cpf, q)
    )
  }

  return NextResponse.json({
    visitantes: resultado.map((v) => ({
      id: v.id, // Usamos o ID do vínculo para garantir unicidade no frontend
      visitanteId: v.visitante.id, // ID real do visitante para buscar a foto
      nomeVisitante: v.visitante.nome,
      cpfVisitante: v.visitante.cpf,
      parentescoVisitante: v.visitante.parentesco,
      ativoVisitante: v.ativo,
      photoPath: v.visitante.photoPath,
      descricao: null, // SipeVisitante não possui campo de descrição livre
      apenado: {
        id: v.apenado.id,
        nome: v.apenado.nome,
        photoPath: v.apenado.photoPath,
      },
    })),
    total: resultado.length,
  })
}
