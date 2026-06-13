/**
 * API de Evento Individual
 * GET    /api/events/[id] - Obter detalhes
 * PUT    /api/events/[id] - Atualizar
 * DELETE /api/events/[id] - Deletar
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { createAuditLog, AUDIT_ACTIONS } from '@/lib/audit'

interface Params {
  params: Promise<{ id: string }>
}

export async function GET(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  try {
    const { id } = await params
    const evento = await prisma.occurrenceEvent.findUnique({
      where: { id },
      include: {
        anexos: {
          where: { deletadoEm: null },
          include: {
            uploadedByUser: {
              select: { id: true, name: true, avatar: true },
            },
          },
        },
        criadoByUser: {
          select: { id: true, name: true, avatar: true },
        },
        atualizadoByUser: {
          select: { id: true, name: true, avatar: true },
        },
      },
    })

    if (!evento) {
      return NextResponse.json({ error: 'Evento não encontrado' }, { status: 404 })
    }

    return NextResponse.json(evento)
  } catch (err) {
    console.error('[Event GET] Erro:', err)
    return NextResponse.json({ error: 'Erro ao buscar evento' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  try {
    const { id } = await params
    const user = session.user as any
    const body = await req.json()

    const evento = await prisma.occurrenceEvent.findUnique({
      where: { id },
    })

    if (!evento) {
      return NextResponse.json({ error: 'Evento não encontrado' }, { status: 404 })
    }

    // Atualizar evento
    const eventoAtualizado = await prisma.occurrenceEvent.update({
      where: { id },
      data: {
        titulo: body.titulo?.trim() || evento.titulo,
        descricao: body.descricao?.trim() || null,
        categoria: body.categoria?.trim() || null,
        dataEvento: body.dataEvento ? new Date(body.dataEvento) : evento.dataEvento,
        atualizadoPor: user.id,
      },
      include: {
        criadoByUser: {
          select: { id: true, name: true, avatar: true },
        },
      },
    })

    // Auditoria
    await createAuditLog({
      userId: user.id,
      action: AUDIT_ACTIONS.UPDATE_EVENT,
      details: { eventoId: evento.id, titulo: evento.titulo },
      request: req,
    })

    return NextResponse.json(eventoAtualizado)
  } catch (err) {
    console.error('[Event PUT] Erro:', err)
    return NextResponse.json({ error: 'Erro ao atualizar evento' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  try {
    const { id } = await params
    const user = session.user as any
    const evento = await prisma.occurrenceEvent.findUnique({
      where: { id },
    })

    if (!evento) {
      return NextResponse.json({ error: 'Evento não encontrado' }, { status: 404 })
    }

    // SUPER_ADMIN e ADMIN deletam direto
    // Outros usuários criam solicitação de aprovação
    if (user.role === 'SUPER_ADMIN' || user.role === 'ADMIN') {
      // Deletar direto (soft delete)
      await prisma.occurrenceEvent.update({
        where: { id },
        data: {
          deletadoEm: new Date(),
          deletadoPor: user.id,
        },
      })

      await createAuditLog({
        userId: user.id,
        action: AUDIT_ACTIONS.DELETE_EVENT,
        details: { eventoId: evento.id, titulo: evento.titulo },
        request: req,
      })

      return NextResponse.json({ success: true, message: 'Evento deletado' })
    } else {
      // Criar solicitação de aprovação
      const solicitacao = await prisma.deleteApprovalRequest.create({
        data: {
          eventId: id,
          solicitadoPor: user.id,
          motivo: 'Deleção solicitada por usuário comum',
          status: 'PENDENTE',
        },
      })

      return NextResponse.json(
        {
          success: true,
          message: 'Solicitação de deleção enviada para aprovação',
          solicitacaoId: solicitacao.id,
        },
        { status: 202 }
      )
    }
  } catch (err) {
    console.error('[Event DELETE] Erro:', err)
    return NextResponse.json({ error: 'Erro ao deletar evento' }, { status: 500 })
  }
}
