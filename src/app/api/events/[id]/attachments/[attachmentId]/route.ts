/**
 * API de Anexo Individual
 * DELETE /api/events/[id]/attachments/[attachmentId] - Deletar anexo
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { deleteFromS3 } from '@/lib/s3-service'
import { createAuditLog, AUDIT_ACTIONS } from '@/lib/audit'

interface Params {
  params: { id: string; attachmentId: string }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  try {
    const user = session.user as any

    // Verificar se anexo existe
    const anexo = await prisma.eventAttachment.findUnique({
      where: { id: params.attachmentId },
    })

    if (!anexo) {
      return NextResponse.json({ error: 'Anexo não encontrado' }, { status: 404 })
    }

    // Verificar se pertence ao evento correto
    if (anexo.eventId !== params.id) {
      return NextResponse.json({ error: 'Anexo não pertence a este evento' }, { status: 400 })
    }

    // SUPER_ADMIN e ADMIN deletam direto
    // Outros usuários criam solicitação de aprovação
    if (user.role === 'SUPER_ADMIN' || user.role === 'ADMIN') {
      // Deletar do S3
      try {
        await deleteFromS3(anexo.nomeS3)
      } catch (err) {
        console.error(`Erro ao deletar arquivo do S3: ${anexo.nomeS3}`, err)
        // Continuar mesmo se falhar o delete do S3
      }

      // Soft delete no banco
      await prisma.eventAttachment.update({
        where: { id: params.attachmentId },
        data: {
          deletadoEm: new Date(),
          deletadoPor: user.id,
        },
      })

      await createAuditLog({
        userId: user.id,
        action: AUDIT_ACTIONS.DELETE_EVENT_ATTACHMENT,
        details: {
          eventoId: params.id,
          anexoId: anexo.id,
          nomeArquivo: anexo.nomeOriginal,
        },
        request: req,
      })

      return NextResponse.json({ success: true, message: 'Anexo deletado' })
    } else {
      // Criar solicitação de aprovação
      const solicitacao = await prisma.deleteApprovalRequest.create({
        data: {
          attachmentId: params.attachmentId,
          solicitadoPor: user.id,
          motivo: 'Deleção de anexo solicitada por usuário comum',
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
    console.error('[Attachment DELETE] Erro:', err)
    return NextResponse.json({ error: 'Erro ao deletar anexo' }, { status: 500 })
  }
}
