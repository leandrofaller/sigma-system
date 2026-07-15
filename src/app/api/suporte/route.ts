import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { PrismaClient } from '@prisma/client'
import { uploadSuporteS3, getAnexoPresignedUrl } from '@/lib/s3'

const prisma = new PrismaClient()

export async function GET(req: Request) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    const { role, id: userId } = session.user
    const isAdmin = role === 'SUPER_ADMIN' || role === 'ADMIN'

    // Se for admin, lista todos os tickets; se não, apenas do próprio usuário
    const tickets = await prisma.supportTicket.findMany({
      where: isAdmin ? {} : { usuarioId: userId },
      include: {
        usuario: {
          select: {
            name: true,
            email: true,
            role: true
          }
        },
        attachments: true
      },
      orderBy: {
        createdAt: 'desc'
      }
    })

    // Gerar URLs assinadas temporárias para cada anexo de suporte
    const ticketsWithPresignedUrls = await Promise.all(
      tickets.map(async (ticket) => {
        const attachmentsWithUrls = await Promise.all(
          ticket.attachments.map(async (attachment) => {
            try {
              const presignedUrl = await getAnexoPresignedUrl(attachment.chaveS3, attachment.nomeOriginal)
              return {
                ...attachment,
                urlPresigned: presignedUrl
              }
            } catch (err) {
              console.error('Erro ao gerar URL assinada para anexo de suporte:', err)
              return {
                ...attachment,
                urlPresigned: attachment.urlS3
              }
            }
          })
        )
        return {
          ...ticket,
          attachments: attachmentsWithUrls
        }
      })
    )

    return NextResponse.json({ tickets: ticketsWithPresignedUrls })
  } catch (error: any) {
    console.error('[SUPPORT GET] Erro:', error)
    return NextResponse.json({ error: 'Erro interno ao obter chamados: ' + error.message }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    const userId = session.user.id
    const formData = await req.formData()

    const assunto = formData.get('assunto') as string
    const categoria = formData.get('categoria') as string
    const descricao = formData.get('descricao') as string
    const prioridade = (formData.get('prioridade') as string) || 'MEDIA'

    if (!assunto || !categoria || !descricao) {
      return NextResponse.json({ error: 'Campos assunto, categoria e descrição são obrigatórios.' }, { status: 400 })
    }

    // 1. Criar o SupportTicket na base
    const ticket = await prisma.supportTicket.create({
      data: {
        assunto,
        categoria,
        descricao,
        prioridade,
        usuarioId: userId
      }
    })

    // 2. Processar múltiplos arquivos/gravações
    const files = formData.getAll('files') as File[]
    const savedAttachments = []

    for (const file of files) {
      if (file && file.size > 0) {
        try {
          // Upload para o S3 na pasta do ticket de suporte
          const uploadRes = await uploadSuporteS3(file, ticket.id)

          // Salvar na tabela do banco
          const attachment = await prisma.supportAttachment.create({
            data: {
              ticketId: ticket.id,
              nomeOriginal: file.name,
              tipoMime: uploadRes.tipoMime,
              urlS3: uploadRes.urlS3,
              chaveS3: uploadRes.chaveS3,
              tamanho: uploadRes.tamanho
            }
          })
          savedAttachments.push(attachment)
        } catch (err: any) {
          console.error(`Erro ao salvar anexo "${file.name}" do suporte:`, err)
        }
      }
    }

    return NextResponse.json({
      success: true,
      ticket: {
        ...ticket,
        attachments: savedAttachments
      }
    })
  } catch (error: any) {
    console.error('[SUPPORT POST] Erro:', error)
    return NextResponse.json({ error: 'Erro interno ao criar chamado: ' + error.message }, { status: 500 })
  }
}
