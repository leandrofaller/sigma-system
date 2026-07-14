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
} from '@/lib/s3-service'
import { createAuditLog, AUDIT_ACTIONS } from '@/lib/audit'
import sharp from 'sharp'

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
    })

    if (!evento) {
      return NextResponse.json({ error: 'Evento não encontrado' }, { status: 404 })
    }

    const anexos = await prisma.eventAttachment.findMany({
      where: {
        eventId: id,
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
    const { id } = await params
    const user = session.user as any
    const formData = await req.formData()
    const files = formData.getAll('file') as File[]

    if (files.length === 0) {
      return NextResponse.json({ error: 'Nenhum arquivo enviado' }, { status: 400 })
    }

    // Verificar se evento existe
    const evento = await prisma.occurrenceEvent.findUnique({
      where: { id },
    })

    if (!evento) {
      return NextResponse.json({ error: 'Evento não encontrado' }, { status: 404 })
    }

    const anexosCriados = []

    for (const file of files) {
      // Converter File para Buffer
      let buffer = Buffer.from(await file.arrayBuffer())
      let contentType = file.type || 'application/octet-stream'
      let fileName = file.name

      // Converter imagens para WebP automaticamente
      if (contentType.startsWith('image/') && contentType !== 'image/webp') {
        try {
          buffer = (await sharp(buffer)
            .webp({ quality: 85 })
            .toBuffer()) as Buffer<ArrayBuffer>
          contentType = 'image/webp'
          // Trocar extensão pelo .webp no nome
          fileName = fileName.replace(/\.[^/.]+$/, '') + '.webp'
          console.log(`[S3] 🖼️ Imagem convertida para WebP: ${fileName}`)
        } catch (sharpErr) {
          // Se falhar a conversão, continua com o arquivo original
          console.warn('[S3] Falha ao converter para WebP, usando original:', sharpErr)
          buffer = Buffer.from(await file.arrayBuffer())
          contentType = file.type
          fileName = file.name
        }
      }

      // Validar arquivo (usa contentType/fileName já convertidos)
      const validacao = validateFile(buffer, contentType, fileName)
      if (!validacao.valid) {
        return NextResponse.json(
          { error: `${file.name}: ${validacao.error}` },
          { status: 400 }
        )
      }

      // Gerar chave S3 e fazer upload (usa fileName convertido)
      const s3Key = generateS3Key(id, fileName)
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
          eventId: id,
          nomeOriginal: fileName,  // nome com .webp se foi convertida
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
          eventoId: id,
          anexoId: anexo.id,
          nomeArquivo: file.name,
          tamanho: buffer.length,
        },
        request: req,
      })

      anexosCriados.push(anexo)
    }

    if (anexosCriados.length === 1) {
      return NextResponse.json(anexosCriados[0], { status: 201 })
    }
    return NextResponse.json(anexosCriados, { status: 201 })
  } catch (err) {
    console.error('[Attachments POST] Erro:', err)
    return NextResponse.json(
      { error: 'Erro ao fazer upload' },
      { status: 500 }
    )
  }
}
