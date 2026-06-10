import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { containsNormalizedText, normalizeSearchText } from '@/lib/search'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const q = normalizeSearchText(searchParams.get('q'))
  const unidade = normalizeSearchText(searchParams.get('unidade'))
  const faccao = searchParams.get('faccao') || ''
  const page = parseInt(searchParams.get('page') || '1')
  const limit = parseInt(searchParams.get('limit') || '20')
  const filteredAdvogados = (await prisma.sipeAdvogado.findMany({
    include: {
      vinculos: {
        where: { ativo: true },
        include: {
          apenado: {
            include: { faccao: true, alcunhas: true },
          },
        },
      },
    },
    orderBy: { nome: 'asc' },
  })).map((advogado) => {
    const vinculos = advogado.vinculos.filter((vinculo) => {
      if (unidade && !containsNormalizedText(vinculo.apenado.unidade, unidade)) {
        return false
      }

      if (faccao === 'qualquer') {
        return vinculo.apenado.faccaoId !== null
      }

      if (faccao) {
        return vinculo.apenado.faccaoId === faccao
      }

      return true
    })

    return { ...advogado, vinculos }
  }).filter((advogado) => {
    if (
      q &&
      !containsNormalizedText(advogado.nome, q) &&
      !containsNormalizedText(advogado.oab, q) &&
      !containsNormalizedText(advogado.cpf, q)
    ) {
      return false
    }

    return advogado.vinculos.length > 0 || (!unidade && !faccao)
  })

  const skip = (page - 1) * limit
  const total = filteredAdvogados.length
  const advogados = filteredAdvogados.slice(skip, skip + limit)

  return NextResponse.json({ advogados, total, page, totalPages: Math.ceil(total / limit) })
}
