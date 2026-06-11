import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  const lastJob = await prisma.sipeSyncJob.findFirst({
    orderBy: { createdAt: 'desc' },
  })
  if (!lastJob) {
    console.log("Nenhum job de sincronização encontrado no banco.");
    return;
  }
  console.log("LAST JOB ID:", lastJob.id)
  console.log("STATUS:", lastJob.status)
  console.log("FASE:", lastJob.fase)
  console.log("TOTAL:", lastJob.total)
  console.log("PROCESSADO:", lastJob.processado)
  console.log("ERROS:", lastJob.erros)
  console.log("LOG:\n", lastJob.log)
}

main().catch(console.error).finally(() => prisma.$disconnect())
