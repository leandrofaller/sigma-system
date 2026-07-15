import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import sharp from 'sharp'
import crypto from 'crypto'

// 🔧 CRÍTICO: Criar S3Client DINAMICAMENTE dentro da função
// Com credenciais explícitas e validação rigorosa
function createS3Client() {
  const region = (process.env.AWS_REGION || 'us-east-1').trim()
  const accessKeyId = (process.env.AWS_ACCESS_KEY_ID || '').trim()
  const secretAccessKey = (process.env.AWS_SECRET_ACCESS_KEY || '').trim()

  // DEBUG: Log detalhado
  console.log('[S3] ============ DEBUG CREDENCIAIS ============')
  console.log('[S3] Variáveis de ambiente (brutas):')
  console.log('  - AWS_REGION:', process.env.AWS_REGION)
  console.log('  - AWS_ACCESS_KEY_ID length:', process.env.AWS_ACCESS_KEY_ID?.length)
  console.log('  - AWS_SECRET_ACCESS_KEY length:', process.env.AWS_SECRET_ACCESS_KEY?.length)
  console.log('[S3] Variáveis após trim():')
  console.log('  - region:', region)
  console.log('  - accessKeyId length:', accessKeyId.length, 'value:', accessKeyId.substring(0, 15) + '...')
  console.log('  - secretAccessKey length:', secretAccessKey.length)
  console.log('[S3] Hora do servidor:', new Date().toISOString())
  console.log('[S3] ==========================================')

  if (!accessKeyId || !secretAccessKey) {
    throw new Error(
      `Credenciais AWS incompletas. AccessKey: ${accessKeyId ? 'OK' : 'MISSING'}, SecretKey: ${secretAccessKey ? 'OK' : 'MISSING'}`
    )
  }

  return new S3Client({
    region,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
    requestHandler: {
      /**
       * @deprecated set httpHandlerOptions instead
       */
      httpsAgent: undefined,
    },
  })
}

export async function uploadAnexoS3(
  file: File,
  apenadoId: string,
  tipoCompactacao: 'imagem' | 'documento' | 'auto'
): Promise<{ urlS3: string; chaveS3: string; tamanho: number; tipoMime: string }> {
  // 🔍 DEBUG: Log das variáveis
  console.log('[S3] Iniciando upload com configuração:', {
    region: process.env.AWS_REGION,
    bucket: process.env.AWS_BUCKET_NAME,
    hasAccessKey: !!process.env.AWS_ACCESS_KEY_ID,
    hasSecretKey: !!process.env.AWS_SECRET_ACCESS_KEY,
    file: file.name,
    apenadoId,
  })

  if (!process.env.AWS_BUCKET_NAME) {
    throw new Error(
      `AWS_BUCKET_NAME está undefined. Variáveis carregadas: REGION=${process.env.AWS_REGION}, ACCESS_KEY=${process.env.AWS_ACCESS_KEY_ID ? 'OK' : 'MISSING'}`
    )
  }

  // 🔧 CRÍTICO: Criar S3Client AQUI (não global) para pegar credenciais atualizadas
  const s3Client = createS3Client()

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
      
      const tempBuf = await imagem
        .resize(800, 800, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 90 })
        .toBuffer()
      compactadoBuffer = Buffer.from(tempBuf)
      tipoMimeProcessado = 'image/webp'
    } catch (erro) {
      console.error('Erro ao compactar imagem:', erro)
      // Continua com imagem original se falhar
    }
  }

  const extensao = getExtensao(tipoMimeProcessado)
  const chaveS3 = `aip-anexos/${apenadoId}/${hash}-${Date.now()}${extensao}`

  // 🛡️ Higieniza o nome original para conter apenas caracteres US-ASCII válidos no metadado do S3
  // Isso evita o erro SignatureDoesNotMatch quando o arquivo possui acentos ou caracteres especiais
  const safeOriginalName = file.name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7E]/g, '_')

  const comando = new PutObjectCommand({
    Bucket: process.env.AWS_BUCKET_NAME!,
    Key: chaveS3,
    Body: compactadoBuffer,
    ContentType: tipoMimeProcessado,
    Metadata: {
      'original-name': safeOriginalName,
      'apenado-id': apenadoId,
    },
  })

  await s3Client.send(comando)

  const urlS3 = `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${chaveS3}`

  return {
    urlS3,
    chaveS3,
    tamanho: compactadoBuffer.length,
    tipoMime: tipoMimeProcessado,
  }
}

export async function uploadSuporteS3(
  file: File,
  ticketId: string
): Promise<{ urlS3: string; chaveS3: string; tamanho: number; tipoMime: string }> {
  console.log('[S3] Iniciando upload de suporte:', {
    bucket: process.env.AWS_BUCKET_NAME,
    file: file.name,
    ticketId,
  })

  if (!process.env.AWS_BUCKET_NAME) {
    throw new Error('AWS_BUCKET_NAME não está definido')
  }

  const s3Client = createS3Client()
  const buffer = await file.arrayBuffer()
  const hash = generateHash(file.name + Date.now())

  let compactadoBuffer = Buffer.from(buffer)
  let tipoMimeProcessado = file.type

  // Apenas compactar imagens
  if (file.type.startsWith('image/')) {
    try {
      const imagem = sharp(Buffer.from(buffer))
      const tempBuf = await imagem
        .resize(1200, 1200, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 85 })
        .toBuffer()
      compactadoBuffer = Buffer.from(tempBuf)
      tipoMimeProcessado = 'image/webp'
    } catch (erro) {
      console.error('Erro ao compactar imagem do suporte:', erro)
    }
  }

  const extensao = getExtensao(tipoMimeProcessado)
  const chaveS3 = `suporte-anexos/${ticketId}/${hash}-${Date.now()}${extensao}`

  const safeOriginalName = file.name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7E]/g, '_')

  const comando = new PutObjectCommand({
    Bucket: process.env.AWS_BUCKET_NAME!,
    Key: chaveS3,
    Body: compactadoBuffer,
    ContentType: tipoMimeProcessado,
    Metadata: {
      'original-name': safeOriginalName,
      'ticket-id': ticketId,
    },
  })

  await s3Client.send(comando)

  const urlS3 = `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${chaveS3}`

  return {
    urlS3,
    chaveS3,
    tamanho: compactadoBuffer.length,
    tipoMime: tipoMimeProcessado,
  }
}

export async function getAnexoPresignedUrl(chaveS3: string, nomeOriginal?: string): Promise<string> {
  const s3Client = createS3Client()
  const command = new GetObjectCommand({
    Bucket: process.env.AWS_BUCKET_NAME!,
    Key: chaveS3,
    ...(nomeOriginal ? {
      ResponseContentDisposition: `attachment; filename="${encodeURIComponent(nomeOriginal)}"`
    } : {})
  })
  return getSignedUrl(s3Client, command, { expiresIn: 300 }) // expira em 5 minutos
}

export async function getAnexoBytes(chaveS3: string): Promise<{ data: Uint8Array | null; contentType: string; contentLength: number }> {
  const s3Client = createS3Client()
  const command = new GetObjectCommand({
    Bucket: process.env.AWS_BUCKET_NAME!,
    Key: chaveS3,
  })
  const response = await s3Client.send(command)
  
  const data = response.Body ? await response.Body.transformToByteArray() : null
  
  return {
    data,
    contentType: response.ContentType || 'application/octet-stream',
    contentLength: response.ContentLength || data?.length || 0,
  }
}

export async function deleteAnexoS3(chaveS3: string): Promise<void> {
  const s3Client = createS3Client()

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
    'audio/webm': '.webm',
    'audio/ogg': '.ogg',
    'audio/mp4': '.m4a',
    'audio/wav': '.wav',
    'audio/mpeg': '.mp3',
    'video/webm': '.webm',
    'video/mp4': '.mp4',
    'video/ogg': '.ogv',
  }
  return extensoes[tipoMime] || '.bin'
}
