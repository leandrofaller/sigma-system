import { config } from 'dotenv'
import { S3Client, ListBucketsCommand } from '@aws-sdk/client-s3'

// Carregar variáveis do .env
config()

async function testS3Connection() {
  console.log('🔍 Testando conexão com AWS S3...\n')
  console.log('Variáveis de ambiente:')
  console.log('AWS_REGION:', process.env.AWS_REGION)
  console.log('AWS_BUCKET_NAME:', process.env.AWS_BUCKET_NAME)
  console.log('AWS_ACCESS_KEY_ID:', process.env.AWS_ACCESS_KEY_ID ? '✓ Configurado' : '✗ Não configurado')
  console.log('AWS_SECRET_ACCESS_KEY:', process.env.AWS_SECRET_ACCESS_KEY ? '✓ Configurado' : '✗ Não configurado')
  console.log('\n')

  if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
    console.error('❌ Erro: Credenciais não configuradas no .env')
    process.exit(1)
  }

  try {
    const s3Client = new S3Client({
      region: process.env.AWS_REGION || 'us-east-1',
    })

    const command = new ListBucketsCommand({})
    const response = await s3Client.send(command)

    console.log('✅ Conexão bem-sucedida!')
    console.log('\nBuckets encontrados:')
    response.Buckets?.forEach(bucket => {
      console.log(`  - ${bucket.Name}`)
    })
  } catch (erro) {
    console.error('❌ Erro ao conectar ao S3:', erro)
    process.exit(1)
  }
}

testS3Connection()
