const { PrismaClient } = require('@prisma/client')
const { startSipeSync } = require('./src/lib/sipe-scraper')

const prisma = new PrismaClient()

async function main() {
  try {
    console.log('📤 Criando job GLOBAL...')
    
    const job = await prisma.sipeSyncJob.create({
      data: {
        tipo: 'GLOBAL',
        unidade: 'GLOBAL',
        unidadeNome: null,
        status: 'RUNNING',
        iniciadoEm: new Date(),
        criadoPor: 'system-admin',
      },
    })
    
    console.log(`✅ Job criado: ${job.id}`)
    console.log(`\n🚀 Iniciando scraping...`)
    console.log(`   Tipo: GLOBAL`)
    console.log(`   Status: RUNNING`)
    
    // Iniciar scraping em background
    startSipeSync(job.id, 'GLOBAL').catch(err => {
      console.error(`❌ Erro no scraping:`, err.message)
    })
    
    console.log(`\n⏳ Scraping iniciado! Acompanhe em tempo real:`)
    console.log(`   - Abra a dashboard e vá para "Sincronização SIPE"`)
    console.log(`   - Ou use: curl http://localhost:3000/api/sipe/sync/stream`)
    
  } catch (e) {
    console.error('❌ Erro:', e.message)
  } finally {
    await prisma.$disconnect()
  }
}

main()
