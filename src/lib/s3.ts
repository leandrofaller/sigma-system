import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import sharp from 'sharp'
import crypto from 'crypto'

// 🔧 CORRIGIDO: Passar credenciais explicitamente em vez de usar credential providers
const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  },
})

export async function uploadAnexoS3(
  file: File,
  apenadoId: string,
  tipoCompactacao: 'imagem' | 'documento' | 'auto'
): Promise<{ urlS3: string; chaveS3: string; tamanho: number }> {
  const buffer = await file.arrayBuffer()
  const hash = generateHash(file.name + Date.now())

  let compactadoBuffer = Buffer.from(buffer)
  let tipoMimeProcessado = file.type

  // Compactação de imagens
  if (
    tipoCompactacao === 'imagem' ||
    (tipoCompactacao === 'auto' && file.type.startsWith('image/'))
  ) {
    try {
      const imagem = sharp(Buffer.from(buffer))
      const metadata = await imagem.metadata()

      if (metadata.width && metadata.height && (metadata.width > 2000 || metadata.height > 2000)) {
        compactadoBuffer = await imagem
          .resize(2000, 2000, { fit: 'inside', withoutEnlargement: true })
          .webp({ quality: 80 })
          .toBuffer()
        tipoMimeProcessado = 'image/webp'
      }
    } catch (erro) {
      console.error('Erro ao compactar imagem:', erro)
      // Continua com imagem original se falhar
    }
  }

  const extensao = getExtensao(tipoMimeProcessado)
  const chaveS3 = `aip-anexos/${apenadoId}/${hash}-${Date.now()}${extensao}`

  const comando = new PutObjectCommand({
    Bucket: process.env.AWS_BUCKET_NAME!,
    Key: chaveS3,
    Body: compactadoBuffer,
    ContentType: tipoMimeProcessado,
    Metadata: {
      'original-name': file.name,
      'apenado-id': apenadoId,
    },
  })

  await s3Client.send(comando)

  const urlS3 = `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${chaveS3}`

  return {
    urlS3,
    chaveS3,
    tamanho: compactadoBuffer.length,
  }
}

export async function deleteAnexoS3(chaveS3: string): Promise<void> {
  const comando = new DeleteObjectCommand({
    Bucket: process.env.AWS_BUCKET_NAME!,
    Key: chaveS3,
  })

  await s3Client.send(comando)
}

function generateHash(str: string): string {
  return crypto.createHash('sha256').update(str).digest('hex').substring(0, 16)
}

function getExtensao(tipoMime: string): string {
  const extensoes: Record<string, string> = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'application/pdf': '.pdf',
    'application/msword': '.doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
    'application/vnd.ms-excel': '.xls',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
    'text/plain': '.txt',
  }
  return extensoes[tipoMime] || '.bin'
}
