const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  try {
    console.log('📤 Criando job GLOBAL para Firecrawl...\n')

    const job = await prisma.sipeSyncJob.create({
      data: {
        tipo: 'GLOBAL',
        unidade: 'GLOBAL',
        unidadeNome: null,
        status: 'PENDING',
        criadoPor: 'system-admin',
      },
    })

    console.log('✅ Job criado com sucesso!')
    console.log('   Job ID: ' + job.id)
    console.log('   Tipo: GLOBAL')
    console.log('   Status: PENDING\n')

    console.log('⚠️  Firecrawl não está rodando em localhost:3002\n')
    console.log('Para usar Firecrawl, inicie em um terminal:')
    console.log('   docker run -p 3002:3002 mendableai/firecrawl:latest\n')

    console.log('Depois execute o scraping COM Firecrawl:')
    console.log('   No dashboard: Sincronização SIPE > Job ID: ' + job.id + ' > Executar')
    console.log('')
    console.log('OU via curl (com ?engine=firecrawl):')
    console.log('   curl http://localhost:3000/api/sipe/sync/stream?jobId=' + job.id)

  } catch (e) {
    console.error('❌ Erro:', e.message)
  } finally {
    await prisma.$disconnect()
  }
}

main()
