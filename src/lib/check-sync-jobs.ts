import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const jobs = await prisma.sipeSyncJob.findMany({
    orderBy: { createdAt: 'desc' },
    take: 10
  })

  console.log('\n📋 Últimas 10 sincronizações:\n')
  for (const job of jobs) {
    const status = job.status === 'COMPLETED' ? '✅' : job.status === 'PENDING' ? '⏳' : '❌'
    const data = job.createdAt?.toLocaleString('pt-BR') || 'N/A'
    console.log(`${status} ${data} | Tipo: ${job.tipo} | Status: ${job.status}`)
    console.log(`   Total: ${job.total} | Processado: ${job.processado} | Erros: ${job.erros}`)
    if (job.log) {
      const logPreview = job.log.substring(0, 150)
      console.log(`   Log: ${logPreview}...`)
    }
    console.log()
  }

  await prisma.$disconnect()
}

main().catch(console.error)
