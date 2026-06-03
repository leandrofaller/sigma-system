/**
 * API de Solicitações de Deleção
 * GET  /api/events/deletion-requests - Listar solicitações (admin only)
 * POST /api/events/deletion-requests/:id/approve - Aprovar deleção
 * POST /api/events/deletion-requests/:id/reject - Rejeitar deleção
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { deleteFromS3 } from '@/lib/s3-service'
import { createAuditLog, AUDIT_ACTIONS } from '@/lib/audit'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const user = session.user as any
  if (user.role !== 'SUPER_ADMIN' && user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Acesso restrito a administradores' }, { status: 403 })
  }

  try {
    const { searchParams } = new URL(req.url)
    const status = searchParams.get('status') || 'PENDENTE'
    const pagina = parseInt(searchParams.get('page') || '1')
    const limite = 20

    const [solicitacoes, total] = await Promise.all([
      prisma.deleteApprovalRequest.findMany({
        where: { status },
        include: {
          event: {
            select: { id: true, titulo: true, dataEvento: true },
          },
          attachment: {
            select: { id: true, nomeOriginal: true, tipo: true },
          },
          solicitadoByUser: {
            select: { id: true, name: true, avatar: true },
          },
          respondidoByUser: {
            select: { id: true, name: true, avatar: true },
          },
        },
        orderBy: { solicitadoEm: 'desc' },
        skip: (pagina - 1) * limite,
        take: limite,
      }),
      prisma.deleteApprovalRequest.count({ where: { status } }),
    ])

    return NextResponse.json({
      solicitacoes,
      total,
      pagina,
      paginas: Math.ceil(total / limite),
    })
  } catch (err) {
    console.error('[DeletionRequests GET] Erro:', err)
    return NextResponse.json(
      { error: 'Erro ao buscar solicitações' },
      { status: 500 }
    )
  }
}

// Endpoint para aprovar deleção
export async function PATCH(req: NextRequest) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const user = session.user as any
  if (user.role !== 'SUPER_ADMIN' && user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Acesso restrito' }, { status: 403 })
  }

  try {
    const { id, acao, resposta } = await req.json()

    if (!['approve', 'reject'].includes(acao)) {
      return NextResponse.json({ error: 'Ação inválida' }, { status: 400 })
    }

    const solicitacao = await prisma.deleteApprovalRequest.findUnique({
      where: { id },
      include: {
        event: true,
        attachment: true,
      },
    })

    if (!solicitacao) {
      return NextResponse.json({ error: 'Solicitação não encontrada' }, { status: 404 })
    }

    if (acao === 'approve') {
      // Se for evento, deletar evento
      if (solicitacao.eventId && solicitacao.event) {
        // Deletar todos os anexos do evento do S3
        const anexos = await prisma.eventAttachment.findMany({
          where: { eventId: solicitacao.eventId },
        })

        for (const anexo of anexos) {
          try {
            await deleteFromS3(anexo.nomeS3)
          } catch (err) {
            console.error(`Erro ao deletar ${anexo.nomeS3}:`, err)
          }
        }

        // Soft delete do evento
        await prisma.occurrenceEvent.update({
          where: { id: solicitacao.eventId },
          data: {
            deletadoEm: new Date(),
            deletadoPor: user.id,
          },
        })
      }
      // Se for anexo, deletar anexo
      else if (solicitacao.attachmentId && solicitacao.attachment) {
        try {
          await deleteFromS3(solicitacao.attachment.nomeS3)
        } catch (err) {
          console.error(`Erro ao deletar ${solicitacao.attachment.nomeS3}:`, err)
        }

        await prisma.eventAttachment.update({
          where: { id: solicitacao.attachmentId },
          data: {
            deletadoEm: new Date(),
            deletadoPor: user.id,
          },
        })
      }

      // Atualizar solicitação
      await prisma.deleteApprovalRequest.update({
        where: { id },
        data: {
          status: 'APROVADO',
          respondidoPor: user.id,
          resposta: resposta || 'Aprovado',
          respondidoEm: new Date(),
        },
      })

      await createAuditLog({
        userId: user.id,
        action: AUDIT_ACTIONS.APPROVE_DELETION_REQUEST,
        details: { solicitacaoId: id },
        request: req,
      })

      return NextResponse.json({ success: true, message: 'Deleção aprovada' })
    } else {
      // Rejeitar
      await prisma.deleteApprovalRequest.update({
        where: { id },
        data: {
          status: 'REJEITADO',
          respondidoPor: user.id,
          resposta: resposta || 'Rejeitado',
          respondidoEm: new Date(),
        },
      })

      await createAuditLog({
        userId: user.id,
        action: AUDIT_ACTIONS.REJECT_DELETION_REQUEST,
        details: { solicitacaoId: id },
        request: req,
      })

      return NextResponse.json({ success: true, message: 'Deleção rejeitada' })
    }
  } catch (err) {
    console.error('[DeletionRequests PATCH] Erro:', err)
    return NextResponse.json(
      { error: 'Erro ao processar solicitação' },
      { status: 500 }
    )
  }
}
