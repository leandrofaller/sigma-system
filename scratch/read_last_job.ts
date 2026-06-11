import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  const jobs = await prisma.sipeSyncJob.findMany({
    orderBy: { createdAt: 'desc' },
    take: 5
  })
  if (jobs.length === 0) {
    console.log("Nenhum job de sincronização encontrado no banco.");
    return;
  }
  for (const job of jobs) {
    console.log(`=== JOB ID: ${job.id} ===`)
    console.log(`TIPO: ${job.tipo}`)
    console.log(`STATUS: ${job.status}`)
    console.log(`FASE: ${job.fase}`)
    console.log(`TOTAL: ${job.total}`)
    console.log(`PROCESSADO: ${job.processado}`)
    console.log(`ERROS: ${job.erros}`)
    console.log(`CRIADO EM: ${job.createdAt}`)
    console.log(`LOG:\n${job.log}`)
    console.log("=================================\n")
  }
}

main().catch(console.error).finally(() => prisma.$disconnect())

