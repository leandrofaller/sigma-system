import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const role = (session.user as any).role
  if (role !== 'SUPER_ADMIN' && role !== 'OPERATOR') {
    return NextResponse.json({ error: 'Acesso restrito' }, { status: 403 })
  }

  const faccoes = await prisma.sipeFaccao.findMany({
    orderBy: { nome: 'asc' },
  })

  // Contar apenados AIP por facção (facaoRealNome = sipeFaccao.nome)
  const nomes = faccoes.map((f) => f.nome)
  const contagens = nomes.length > 0
    ? await prisma.aIPApenado.groupBy({
        by: ['facaoRealNome'],
        where: { facaoRealNome: { in: nomes } },
        _count: { _all: true },
      })
    : []

  const contagemMap = Object.fromEntries(
    contagens.map((c) => [c.facaoRealNome!, (c._count as { _all: number })._all])
  )

  return NextResponse.json({
    faccoes: faccoes.map((f) => ({
      id: f.id,
      sipeId: f.sipeId,
      nome: f.nome,
      sigla: f.sigla,
      cor: f.cor ?? '#ef4444',
      descricao: f.descricao,
      ativa: f.ativa,
      totalApenados: contagemMap[f.nome] ?? 0,
    })),
  })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const role = (session.user as any).role
  if (role !== 'SUPER_ADMIN' && role !== 'OPERATOR') {
    return NextResponse.json({ error: 'Acesso restrito' }, { status: 403 })
  }

  const body = await req.json()
  const { nome, sigla, cor, descricao } = body

  if (!nome?.trim()) return NextResponse.json({ error: 'Nome obrigatório' }, { status: 400 })

  // Verificar se já existe
  const existe = await prisma.sipeFaccao.findFirst({ where: { nome: { equals: nome.trim(), mode: 'insensitive' } } })
  if (existe) return NextResponse.json({ error: 'Já existe uma facção com este nome' }, { status: 409 })

  // sipeId negativo (igual ao padrão do SIAIP)
  const menorId = await prisma.sipeFaccao.findFirst({
    where: { sipeId: { lt: 0 } },
    orderBy: { sipeId: 'asc' },
    select: { sipeId: true },
  })
  const sipeId = menorId ? menorId.sipeId - 1 : -1

  const faccao = await prisma.sipeFaccao.create({
    data: {
      sipeId,
      nome: nome.trim(),
      sigla: sigla?.trim() || null,
      cor: cor || '#ef4444',
      descricao: descricao?.trim() || null,
    },
  })

  return NextResponse.json({ ...faccao, totalApenados: 0 }, { status: 201 })
}
