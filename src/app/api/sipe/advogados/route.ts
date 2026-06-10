import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q') || ''
  const unidade = searchParams.get('unidade') || ''
  const faccao = searchParams.get('faccao') || ''
  const page = parseInt(searchParams.get('page') || '1')
  const limit = parseInt(searchParams.get('limit') || '20')
  const skip = (page - 1) * limit

  const where: any = q
    ? {
        OR: [
          { nome: { contains: q, mode: 'insensitive' as const } },
          { oab: { contains: q } },
          { cpf: { contains: q } },
        ],
      }
    : {}

  const apenadoFilter: any = {}

  if (unidade) {
    apenadoFilter.unidade = {
      contains: unidade,
      mode: 'insensitive' as const
    }
  }

  if (faccao === 'qualquer') {
    apenadoFilter.faccaoId = { not: null }
  } else if (faccao) {
    apenadoFilter.faccaoId = faccao
  }

  if (unidade || faccao) {
    where.vinculos = {
      some: {
        ativo: true,
        apenado: apenadoFilter
      }
    }
  }

  const [total, advogados] = await Promise.all([
    prisma.sipeAdvogado.count({ where }),
    prisma.sipeAdvogado.findMany({
      where,
      include: {
        vinculos: {
          where: {
            ativo: true,
            ...((unidade || faccao) ? {
              apenado: apenadoFilter
            } : {})
          },
          include: {
            apenado: {
              include: { faccao: true, alcunhas: true },
            },
          },
        },
      },
      orderBy: { nome: 'asc' },
      skip,
      take: limit,
    }),
  ])

  return NextResponse.json({ advogados, total, page, totalPages: Math.ceil(total / limit) })
}
