import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { containsNormalizedText, normalizeSearchText } from '@/lib/search'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const q = normalizeSearchText(searchParams.get('q'))
  const faccaoId = searchParams.get('faccaoId')
  const unidade = normalizeSearchText(searchParams.get('unidade'))
  const situacao = normalizeSearchText(searchParams.get('situacao'))
  const page = parseInt(searchParams.get('page') || '1')
  const limit = parseInt(searchParams.get('limit') || '20')
  const filteredApenados = (await prisma.sipeApenadoImportado.findMany({
    where: faccaoId ? { faccaoId } : undefined,
    include: {
      faccao: true,
      alcunhas: true,
      processos: true,
      historicos: {
        orderBy: { datahora: 'desc' }
      },
      vinculosAdvogado: { include: { advogado: true } },
      vinculosVisitante: { include: { visitante: true } },
      apenado: {
        select: { photoPath: true }
      },
    },
    orderBy: { nome: 'asc' },
  })).filter((apenado) => {
    if (
      q &&
      !containsNormalizedText(apenado.nome, q) &&
      !containsNormalizedText(apenado.cpf, q) &&
      !containsNormalizedText(apenado.rg, q) &&
      !apenado.alcunhas.some((alcunha) => containsNormalizedText(alcunha.alcunha, q))
    ) {
      return false
    }

    if (unidade && !containsNormalizedText(apenado.unidade, unidade)) {
      return false
    }

    if (situacao && !containsNormalizedText(apenado.situacao, situacao)) {
      return false
    }

    return true
  })

  const skip = (page - 1) * limit
  const total = filteredApenados.length
  const apenados = filteredApenados.slice(skip, skip + limit)

  return NextResponse.json({ apenados, total, page, totalPages: Math.ceil(total / limit) })
}
