import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const job = await prisma.sipeSyncJob.findFirst({
    where: { tipo: 'FACCOES' },
    orderBy: { createdAt: 'desc' }
  })

  console.log('=== LOG DETALHADO DO JOB ATUAL ===')
  console.log(JSON.stringify(job, null, 2))
}

main().catch(console.error).finally(() => prisma.$disconnect())
