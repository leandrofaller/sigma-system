/**
 * S3 Service — Upload/Download de arquivos para AWS S3
 * Usado pelo Mural de Eventos para anexos
 */

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { createHash } from 'crypto'

// ── Config ────────────────────────────────────────────────────

const AWS_REGION = process.env.AWS_REGION || 'us-east-2'
const AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID || ''
const AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY || ''
const S3_BUCKET_NAME = process.env.S3_BUCKET_NAME || 'sigma-aip-s3-user'
const S3_ANEXOS_PATH = 'anexos/' // Pasta base para anexos do Mural

// ── S3 Client ────────────────────────────────────────────────

let s3Client: S3Client | null = null

function getS3Client(): S3Client {
  if (!s3Client) {
    s3Client = new S3Client({
      region: AWS_REGION,
      credentials: {
        accessKeyId: AWS_ACCESS_KEY_ID,
        secretAccessKey: AWS_SECRET_ACCESS_KEY,
      },
    })
  }
  return s3Client
}

// ── Utilities ────────────────────────────────────────────────

/**
 * Gera um nome único e seguro para o arquivo em S3
 * Formato: anexos/eventos/YYYY-MM-DD/hash-nomeoriginal.ext
 */
export function generateS3Key(
  eventId: string,
  nomeOriginal: string
): string {
  const hash = createHash('sha256')
    .update(`${eventId}-${nomeOriginal}-${Date.now()}`)
    .digest('hex')
    .slice(0, 12)

  const ext = nomeOriginal.split('.').pop() || 'bin'
  const safeName = nomeOriginal
    .replace(/[^a-zA-Z0-9.-]/g, '_')
    .replace(/\.+/g, '.')
    .slice(0, 100)

  const date = new Date().toISOString().split('T')[0] // YYYY-MM-DD
  return `${S3_ANEXOS_PATH}eventos/${date}/${hash}-${safeName}.${ext}`
}

/**
 * Upload de arquivo para S3
 */
export async function uploadToS3(
  key: string,
  buffer: Buffer,
  contentType: string
): Promise<{ key: string; url: string }> {
  const s3 = getS3Client()

  try {
    const command = new PutObjectCommand({
      Bucket: S3_BUCKET_NAME,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      Metadata: {
        'uploaded-at': new Date().toISOString(),
      },
    })

    await s3.send(command)

    // Retornar URL pública (assumindo que o bucket está configurado para acesso público)
    const url = `https://${S3_BUCKET_NAME}.s3.${AWS_REGION}.amazonaws.com/${key}`

    console.log(`[S3] ✅ Arquivo enviado: ${key}`)
    return { key, url }
  } catch (err) {
    console.error(`[S3] ❌ Erro ao fazer upload de ${key}:`, err)
    throw new Error(`Falha ao fazer upload: ${err}`)
  }
}

/**
 * Gera uma URL pré-assinada para download (válida por 1 hora)
 */
export async function getDownloadUrl(key: string, expiresIn: number = 3600): Promise<string> {
  const s3 = getS3Client()

  try {
    const command = new GetObjectCommand({
      Bucket: S3_BUCKET_NAME,
      Key: key,
    })

    const url = await getSignedUrl(s3, command, { expiresIn })
    return url
  } catch (err) {
    console.error(`[S3] ❌ Erro ao gerar URL de download para ${key}:`, err)
    throw new Error(`Falha ao gerar URL: ${err}`)
  }
}

/**
 * Deleta arquivo do S3
 */
export async function deleteFromS3(key: string): Promise<void> {
  const s3 = getS3Client()

  try {
    const command = new DeleteObjectCommand({
      Bucket: S3_BUCKET_NAME,
      Key: key,
    })

    await s3.send(command)
    console.log(`[S3] ✅ Arquivo deletado: ${key}`)
  } catch (err) {
    console.error(`[S3] ❌ Erro ao deletar ${key}:`, err)
    throw new Error(`Falha ao deletar arquivo: ${err}`)
  }
}

/**
 * Verifica se arquivo existe no S3
 */
export async function fileExistsInS3(key: string): Promise<boolean> {
  const s3 = getS3Client()

  try {
    const command = new HeadObjectCommand({
      Bucket: S3_BUCKET_NAME,
      Key: key,
    })

    await s3.send(command)
    return true
  } catch (err: any) {
    if (err.name === 'NotFound') {
      return false
    }
    console.error(`[S3] ❌ Erro ao verificar existência de ${key}:`, err)
    return false
  }
}

/**
 * Validação de arquivo
 */
export interface FileValidation {
  valid: boolean
  error?: string
}

const ALLOWED_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
]

const MAX_FILE_SIZE = 50 * 1024 * 1024 // 50MB

export function validateFile(
  buffer: Buffer,
  contentType: string,
  fileName: string
): FileValidation {
  // Verificar tamanho
  if (buffer.length > MAX_FILE_SIZE) {
    return {
      valid: false,
      error: `Arquivo muito grande. Máximo permitido: ${MAX_FILE_SIZE / 1024 / 1024}MB`,
    }
  }

  // Verificar tipo MIME
  if (!ALLOWED_TYPES.includes(contentType)) {
    return {
      valid: false,
      error: `Tipo de arquivo não permitido: ${contentType}. Permitidos: imagens, PDFs, documentos.`,
    }
  }

  // Verificar extensão
  const ext = fileName.split('.').pop()?.toLowerCase()
  const allowedExts = [
    'jpg', 'jpeg', 'png', 'webp', 'gif',
    'pdf',
    'doc', 'docx',
    'xls', 'xlsx',
    'txt',
  ]

  if (!ext || !allowedExts.includes(ext)) {
    return {
      valid: false,
      error: `Extensão não permitida: .${ext}`,
    }
  }

  return { valid: true }
}
