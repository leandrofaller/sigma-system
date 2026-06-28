import { prisma } from '../src/lib/db'
import { getAnexoStream, getAnexoPresignedUrl } from '../src/lib/s3'
import dotenv from 'dotenv'
import path from 'path'

// Carrega variáveis do arquivo .env
dotenv.config({ path: path.resolve(__dirname, '../.env') })

async function main() {
  console.log('=== Iniciando Teste S3 ===')
  console.log('Bucket:', process.env.AWS_BUCKET_NAME)
  console.log('Region:', process.env.AWS_REGION)
  
  // Buscar um anexo
  const anexo = await prisma.aIPApenadoAnexo.findFirst({
    orderBy: { dataUpload: 'desc' }
  })

  if (!anexo) {
    console.log('Nenhum anexo encontrado no banco!')
    return
  }

  console.log('Anexo encontrado no banco:')
  console.log('ID:', anexo.id)
  console.log('Nome Original:', anexo.nomeOriginal)
  console.log('Chave S3:', anexo.chaveS3)
  console.log('URL S3:', anexo.urlS3)

  try {
    console.log('\n--- Testando getAnexoPresignedUrl ---')
    const presignedUrl = await getAnexoPresignedUrl(anexo.chaveS3, anexo.nomeOriginal)
    console.log('Presigned URL gerada com sucesso!')
    console.log('URL:', presignedUrl)
  } catch (error: any) {
    console.error('Erro ao gerar Presigned URL:', error)
  }

  try {
    console.log('\n--- Testando getAnexoStream ---')
    const streamRes = await getAnexoStream(anexo.chaveS3)
    console.log('Status: Stream obtido do S3 com sucesso!')
    console.log('Content-Type:', streamRes.contentType)
    console.log('Content-Length:', streamRes.contentLength)
    console.log('Possui Body:', !!streamRes.body)
  } catch (error: any) {
    console.error('Erro ao obter Stream do S3:', error)
  }
}

main()
  .catch(e => {
    console.error('Erro geral no script de teste:', e)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
