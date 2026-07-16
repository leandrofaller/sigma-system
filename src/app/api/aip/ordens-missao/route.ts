import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const role = (session.user as any).role
  if (!['SUPER_ADMIN', 'ADMIN', 'OPERATOR'].includes(role)) {
    return NextResponse.json({ error: 'Acesso restrito' }, { status: 403 })
  }

  try {
    const { searchParams } = new URL(req.url)
    const status = searchParams.get('status')

    // Expira automaticamente ordens ATIVA com prazo vencido
    await prisma.ordemMissao.updateMany({
      where: { status: 'ATIVA', prazo: { lt: new Date() } },
      data: { status: 'VENCIDA' },
    })

    const ordens = await prisma.ordemMissao.findMany({
      where: status && status !== 'TODAS' ? { status: status as any } : undefined,
      include: {
        emitidoPor: { select: { id: true, name: true, role: true, avatar: true } },
        concluidoPor: { select: { id: true, name: true, role: true, avatar: true } },
        participantes: {
          include: { user: { select: { id: true, name: true, role: true, avatar: true } } },
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json({ ordens })
  } catch (error) {
    console.error('[ORDENS MISSAO] Erro ao listar:', error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const role = (session.user as any).role
  if (!['SUPER_ADMIN', 'ADMIN'].includes(role)) {
    return NextResponse.json({ error: 'Apenas administradores podem emitir ordens de missão' }, { status: 403 })
  }

  try {
    const body = await req.json()
    const {
      numero, titulo, historico, ipNumero, naturezaFato,
      dataFato, horaFato, localFato, vitima,
      naturezaInvestigacao, observacoes, prazo,
      demandanteNome, demandanteFuncao,
      participanteIds = [],
    } = body

    if (!numero || !titulo || !prazo) {
      return NextResponse.json({ error: 'Número, título e prazo são obrigatórios' }, { status: 400 })
    }

    const ordem = await prisma.ordemMissao.create({
      data: {
        numero,
        titulo,
        historico: historico || null,
        ipNumero: ipNumero || null,
        naturezaFato: naturezaFato || null,
        dataFato: dataFato ? new Date(dataFato) : null,
        horaFato: horaFato || null,
        localFato: localFato || null,
        vitima: vitima || null,
        naturezaInvestigacao: naturezaInvestigacao || null,
        observacoes: observacoes || null,
        prazo: new Date(prazo),
        emitidoPorId: (session.user as any).id,
        demandanteNome: demandanteNome || null,
        demandanteFuncao: demandanteFuncao || null,
        participantes: {
          create: participanteIds.map((userId: string) => ({ userId })),
        },
      },
      include: {
        emitidoPor: { select: { id: true, name: true, role: true, avatar: true } },
        participantes: {
          include: { user: { select: { id: true, name: true, role: true, avatar: true } } },
        },
      },
    })

    return NextResponse.json({ ordem }, { status: 201 })
  } catch (error: any) {
    if (error?.code === 'P2002') {
      return NextResponse.json({ error: 'Já existe uma ordem com este número' }, { status: 409 })
    }
    console.error('[ORDENS MISSAO] Erro ao criar:', error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
