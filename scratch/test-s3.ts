import { prisma } from '../src/lib/db'
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3'
import dotenv from 'dotenv'
import path from 'path'

// Carrega variáveis do arquivo .env
dotenv.config({ path: path.resolve(__dirname, '../.env') })

function createS3Client() {
  const region = (process.env.AWS_REGION || 'us-east-1').trim()
  const accessKeyId = (process.env.AWS_ACCESS_KEY_ID || '').trim()
  const secretAccessKey = (process.env.AWS_SECRET_ACCESS_KEY || '').trim()

  return new S3Client({
    region,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  })
}

async function main() {
  console.log('=== Testando transformToByteArray ===')
  const s3Client = createS3Client()
  
  const anexo = await prisma.aIPApenadoAnexo.findFirst({
    orderBy: { dataUpload: 'desc' }
  })

  if (!anexo) {
    console.log('Nenhum anexo encontrado!')
    return
  }

  console.log('Testando para o anexo:', anexo.nomeOriginal)

  const command = new GetObjectCommand({
    Bucket: process.env.AWS_BUCKET_NAME!,
    Key: anexo.chaveS3,
  })

  try {
    const response = await s3Client.send(command)
    console.log('Objeto S3 obtido com sucesso!')
    
    if (response.Body) {
      console.log('Tentando transformToByteArray()...')
      const byteArray = await response.Body.transformToByteArray()
      console.log('Sucesso! Tamanho do Uint8Array obtido:', byteArray.length)
      console.log('Tipo do Array:', byteArray.constructor.name)
    } else {
      console.log('response.Body está vazio!')
    }
  } catch (err: any) {
    console.error('Erro ao ler do S3:', err)
  }
}

main()
  .finally(async () => {
    await prisma.$disconnect()
  })
