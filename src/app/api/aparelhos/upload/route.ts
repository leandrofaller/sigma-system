import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { uploadToS3, generateS3Key, validateFile } from '@/lib/s3-service'
import { createAuditLog } from '@/lib/audit'
import sharp from 'sharp'

export async function POST(req: NextRequest) {
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

    let buffer = Buffer.from(await file.arrayBuffer())
    let contentType = file.type || 'application/octet-stream'
    let fileName = file.name

    // Validar tipo de imagem
    if (!contentType.startsWith('image/')) {
      return NextResponse.json(
        { error: 'Apenas imagens são permitidas para fotos de aparelhos.' },
        { status: 400 }
      )
    }

    // Converter imagens para WebP automaticamente
    if (contentType !== 'image/webp') {
      try {
        buffer = (await sharp(buffer)
          .webp({ quality: 85 })
          .toBuffer()) as Buffer<ArrayBuffer>
        contentType = 'image/webp'
        fileName = fileName.replace(/\.[^/.]+$/, '') + '.webp'
        console.log(`[S3 - Aparelhos] 🖼️ Foto convertida para WebP: ${fileName}`)
      } catch (sharpErr) {
        console.warn('[S3 - Aparelhos] Falha ao converter para WebP, usando original:', sharpErr)
        buffer = Buffer.from(await file.arrayBuffer())
        contentType = file.type
        fileName = file.name
      }
    }

    // Validar arquivo (tamanho máximo e formato)
    const validacao = validateFile(buffer, contentType, fileName)
    if (!validacao.valid) {
      return NextResponse.json(
        { error: validacao.error },
        { status: 400 }
      )
    }

    // Gerar chave S3 sob um escopo "aparelhos"
    const s3Key = generateS3Key('aparelhos', fileName)
    const { url } = await uploadToS3(s3Key, buffer, contentType)

    // Log de auditoria para o upload
    await createAuditLog({
      userId: user.id,
      action: 'UPLOAD_APARELHO_FOTO',
      entity: 'AparelhoApreendido',
      details: {
        nomeOriginal: file.name,
        nomeS3: s3Key,
        tamanho: buffer.length,
      },
    })

    return NextResponse.json({
      urlS3: url,
      chaveS3: s3Key,
      nomeOriginal: fileName,
    }, { status: 201 })
  } catch (err: any) {
    console.error('[Aparelhos Upload POST] Erro:', err)
    return NextResponse.json(
      { error: 'Erro ao fazer upload da imagem: ' + err.message },
      { status: 500 }
    )
  }
}
