import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('=== LISTANDO ÚLTIMOS 30 JOBS DE SINCRONIZAÇÃO ===\n')

  const jobs = await prisma.sipeSyncJob.findMany({
    orderBy: { createdAt: 'desc' },
    take: 30,
    select: {
      id: true,
      tipo: true,
      status: true,
      unidadeNome: true,
      processado: true,
      erros: true,
      log: true,
      createdAt: true,
      finalizadoEm: true
    }
  })

  for (const job of jobs) {
    console.log(`ID: ${job.id} | Tipo: ${job.tipo} | Status: ${job.status} | Processado: ${job.processado} | Erros: ${job.erros} | Criado: ${job.createdAt}`)
    if (job.log) {
      console.log(`Log (últimas 200 letras): ${job.log.replace(/\n/g, ' | ').slice(-200)}`)
    }
    console.log('---')
  }
}

main().catch(console.error).finally(() => prisma.$disconnect())
