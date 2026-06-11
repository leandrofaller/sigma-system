import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const jobId = 'cmqa1pl3y004zy81a4y8pbyin'
  const job = await prisma.sipeSyncJob.findUnique({
    where: { id: jobId }
  })
  
  if (job) {
    console.log(`=== LOG COMPLETO DO JOB ${jobId} ===`)
    console.log(job.log)
  } else {
    console.log(`Job ${jobId} não encontrado.`)
  }
}

main().catch(console.error).finally(() => prisma.$disconnect())
