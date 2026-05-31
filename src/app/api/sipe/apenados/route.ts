import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if ((session.user as any).role !== 'SUPER_ADMIN') return NextResponse.json({ error: 'Acesso restrito ao Superadmin' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q') || ''
  const faccaoId = searchParams.get('faccaoId')
  const unidade = searchParams.get('unidade')
  const page = parseInt(searchParams.get('page') || '1')
  const limit = parseInt(searchParams.get('limit') || '20')
  const skip = (page - 1) * limit

  const where: Record<string, any> = {
    sexo: { not: null }
  }

  if (q) {
    where.OR = [
      { nome: { contains: q, mode: 'insensitive' } },
      { cpf: { contains: q } },
      { rg: { contains: q } },
      { alcunhas: { some: { alcunha: { contains: q, mode: 'insensitive' } } } },
    ]
  }

  if (faccaoId) where.faccaoId = faccaoId
  if (unidade) where.unidade = { contains: unidade, mode: 'insensitive' }

  const [total, apenados] = await Promise.all([
    prisma.sipeApenadoImportado.count({ where }),
    prisma.sipeApenadoImportado.findMany({
      where,
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
      skip,
      take: limit,
    }),
  ])

  return NextResponse.json({ apenados, total, page, totalPages: Math.ceil(total / limit) })
}
