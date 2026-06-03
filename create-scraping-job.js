const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  try {
    console.log('📤 Criando job GLOBAL para re-sincronização...')

    const job = await prisma.sipeSyncJob.create({
      data: {
        tipo: 'GLOBAL',
        unidade: 'GLOBAL',
        unidadeNome: null,
        status: 'PENDING',
        iniciadoEm: null,
        criadoPor: 'system-admin',
      },
    })

    console.log('\n✅ Job criado com sucesso!')
    console.log('   Job ID: ' + job.id)
    console.log('   Tipo: GLOBAL')
    console.log('   Status: PENDING')

    console.log('\n🚀 Para iniciar o scraping:')
    console.log('   1. Abra o dashboard em http://localhost:3000')
    console.log('   2. Vá para "Sincronização SIPE"')
    console.log('   3. Procure pelo job com ID: ' + job.id)
    console.log('   4. Clique em "Executar"')

  } catch (e) {
    console.error('❌ Erro:', e.message)
  } finally {
    await prisma.$disconnect()
  }
}

main()
