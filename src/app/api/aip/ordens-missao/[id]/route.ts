import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const role = (session.user as any).role
  if (!['SUPER_ADMIN', 'ADMIN', 'OPERATOR'].includes(role)) {
    return NextResponse.json({ error: 'Acesso restrito' }, { status: 403 })
  }

  const { id } = await params

  try {
    const ordem = await prisma.ordemMissao.findUnique({
      where: { id },
      include: {
        emitidoPor: { select: { id: true, name: true, role: true, avatar: true } },
        participantes: {
          include: { user: { select: { id: true, name: true, role: true, avatar: true } } },
          orderBy: { createdAt: 'asc' },
        },
      },
    })

    if (!ordem) return NextResponse.json({ error: 'Ordem não encontrada' }, { status: 404 })

    return NextResponse.json({ ordem })
  } catch (error) {
    console.error('[ORDENS MISSAO] Erro ao buscar:', error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const role = (session.user as any).role
  const userId = (session.user as any).id
  const { id } = await params

  try {
    const ordem = await prisma.ordemMissao.findUnique({
      where: { id },
      select: { emitidoPorId: true },
    })

    if (!ordem) return NextResponse.json({ error: 'Ordem não encontrada' }, { status: 404 })

    const canEdit = ['SUPER_ADMIN', 'ADMIN'].includes(role) || ordem.emitidoPorId === userId
    if (!canEdit) {
      return NextResponse.json({ error: 'Sem permissão para editar esta ordem' }, { status: 403 })
    }

    const body = await req.json()
    const {
      titulo, historico, ipNumero, naturezaFato,
      dataFato, horaFato, localFato, vitima,
      naturezaInvestigacao, observacoes, prazo,
      status, participanteIds,
      demandanteNome, demandanteFuncao,
    } = body

    const updated = await prisma.ordemMissao.update({
      where: { id },
      data: {
        ...(titulo !== undefined && { titulo }),
        ...(historico !== undefined && { historico: historico || null }),
        ...(ipNumero !== undefined && { ipNumero: ipNumero || null }),
        ...(naturezaFato !== undefined && { naturezaFato: naturezaFato || null }),
        ...(dataFato !== undefined && { dataFato: dataFato ? new Date(dataFato) : null }),
        ...(horaFato !== undefined && { horaFato: horaFato || null }),
        ...(localFato !== undefined && { localFato: localFato || null }),
        ...(vitima !== undefined && { vitima: vitima || null }),
        ...(naturezaInvestigacao !== undefined && { naturezaInvestigacao: naturezaInvestigacao || null }),
        ...(observacoes !== undefined && { observacoes: observacoes || null }),
        ...(prazo !== undefined && { prazo: new Date(prazo) }),
        ...(status !== undefined && { status }),
        ...(demandanteNome !== undefined && { demandanteNome: demandanteNome || null }),
        ...(demandanteFuncao !== undefined && { demandanteFuncao: demandanteFuncao || null }),
        ...(participanteIds !== undefined && {
          participantes: {
            deleteMany: {},
            create: participanteIds.map((uid: string) => ({ userId: uid })),
          },
        }),
      },
      include: {
        emitidoPor: { select: { id: true, name: true, role: true, avatar: true } },
        participantes: {
          include: { user: { select: { id: true, name: true, role: true, avatar: true } } },
          orderBy: { createdAt: 'asc' },
        },
      },
    })

    return NextResponse.json({ ordem: updated })
  } catch (error) {
    console.error('[ORDENS MISSAO] Erro ao atualizar:', error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const role = (session.user as any).role
  if (!['SUPER_ADMIN', 'ADMIN'].includes(role)) {
    return NextResponse.json({ error: 'Sem permissão para excluir ordens de missão' }, { status: 403 })
  }

  const { id } = await params

  try {
    await prisma.ordemMissao.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[ORDENS MISSAO] Erro ao excluir:', error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
