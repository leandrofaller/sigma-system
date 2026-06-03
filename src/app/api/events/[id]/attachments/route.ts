/**
 * API de Anexos do Evento
 * POST /api/events/[id]/attachments - Upload de arquivo
 * GET  /api/events/[id]/attachments - Listar anexos
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import {
  uploadToS3,
  generateS3Key,
  validateFile,
  getDownloadUrl,
} from '@/lib/s3-service'
import { createAuditLog, AUDIT_ACTIONS } from '@/lib/audit'

interface Params {
  params: { id: string }
}

export async function GET(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  try {
    const evento = await prisma.occurrenceEvent.findUnique({
      where: { id: params.id },
    })

    if (!evento) {
      return NextResponse.json({ error: 'Evento não encontrado' }, { status: 404 })
    }

    const anexos = await prisma.eventAttachment.findMany({
      where: {
        eventId: params.id,
        deletadoEm: null,
      },
      include: {
        uploadedByUser: {
          select: { id: true, name: true, avatar: true },
        },
      },
      orderBy: { uploadedAt: 'desc' },
    })

    return NextResponse.json(anexos)
  } catch (err) {
    console.error('[Attachments GET] Erro:', err)
    return NextResponse.json({ error: 'Erro ao buscar anexos' }, { status: 500 })
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  try {
    const user = session.user as any
    const formData = await req.formData()
    const file = formData.get('file') as File

    if (!file) {
      return NextResponse.json({ error: 'Nenhum arquivo enviado' }, { status: 400 })
    }

    // Verificar se evento existe
    const evento = await prisma.occurrenceEvent.findUnique({
      where: { id: params.id },
    })

    if (!evento) {
      return NextResponse.json({ error: 'Evento não encontrado' }, { status: 404 })
    }

    // Converter File para Buffer
    const buffer = Buffer.from(await file.arrayBuffer())
    const contentType = file.type || 'application/octet-stream'

    // Validar arquivo
    const validacao = validateFile(buffer, contentType, file.name)
    if (!validacao.valid) {
      return NextResponse.json(
        { error: validacao.error },
        { status: 400 }
      )
    }

    // Gerar chave S3 e fazer upload
    const s3Key = generateS3Key(params.id, file.name)
    const { url } = await uploadToS3(s3Key, buffer, contentType)

    // Determinar tipo de anexo
    let tipo = 'outro'
    if (contentType.startsWith('image/')) {
      tipo = 'foto'
    } else if (contentType === 'application/pdf') {
      tipo = 'pdf'
    } else if (
      contentType.includes('word') ||
      contentType.includes('document')
    ) {
      tipo = 'documento'
    }

    // Salvar registro no banco
    const anexo = await prisma.eventAttachment.create({
      data: {
        eventId: params.id,
        nomeOriginal: file.name,
        nomeS3: s3Key,
        tipo,
        tipoMime: contentType,
        tamanho: buffer.length,
        urlS3: url,
        uploadedBy: user.id,
      },
      include: {
        uploadedByUser: {
          select: { id: true, name: true, avatar: true },
        },
      },
    })

    // Auditoria
    await createAuditLog({
      userId: user.id,
      action: AUDIT_ACTIONS.UPLOAD_EVENT_ATTACHMENT,
      details: {
        eventoId: params.id,
        anexoId: anexo.id,
        nomeArquivo: file.name,
        tamanho: buffer.length,
      },
      request: req,
    })

    return NextResponse.json(anexo, { status: 201 })
  } catch (err) {
    console.error('[Attachments POST] Erro:', err)
    return NextResponse.json(
      { error: 'Erro ao fazer upload' },
      { status: 500 }
    )
  }
}
