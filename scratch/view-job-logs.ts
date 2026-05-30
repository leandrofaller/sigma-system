import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const jobs = await prisma.sipeSyncJob.findMany({
    orderBy: { createdAt: 'desc' },
    take: 5
  })

  console.log('Últimos 5 Jobs de Sincronização:')
  for (const job of jobs) {
    console.log(`\nID: ${job.id}`)
    console.log(`Tipo: ${job.tipo}`)
    console.log(`Status: ${job.status}`)
    console.log(`Total: ${job.total} | Processado: ${job.processado} | Erros: ${job.erros}`)
    console.log(`Criado em: ${job.createdAt}`)
    console.log(`Log (últimos 1000 chars):`)
    console.log(job.log ? job.log.substring(job.log.length - 1000) : 'Sem logs')
    console.log('═'.repeat(60))
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
