import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const runningJobs = await prisma.sipeSyncJob.findMany({
    where: { status: 'RUNNING' },
    orderBy: { createdAt: 'desc' }
  })

  console.log('=== JOBS EM EXECUÇÃO ===')
  console.log(`Total: ${runningJobs.length}`)
  runningJobs.forEach(j => {
    console.log(`ID: ${j.id} | Tipo: ${j.tipo} | Unidade: ${j.unidadeNome} | Criado em: ${j.createdAt.toISOString()}`)
  })
}

main().catch(console.error).finally(() => prisma.$disconnect())
