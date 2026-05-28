import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const withCount = searchParams.get('withCount') === 'true'

  const faccoes = await prisma.sipeFaccao.findMany({
    orderBy: { nome: 'asc' },
    include: withCount
      ? { _count: { select: { apenados: true } } }
      : undefined,
  })

  return NextResponse.json(faccoes)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const body = await req.json()
  const { nome, sigla, cor, descricao } = body

  if (!nome) return NextResponse.json({ error: 'Nome obrigatório' }, { status: 400 })

  const faccao = await prisma.sipeFaccao.create({
    data: {
      sipeId: Date.now(),
      nome,
      sigla,
      cor: cor || '#ef4444',
      descricao,
    },
  })

  return NextResponse.json(faccao, { status: 201 })
}
