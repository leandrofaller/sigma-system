import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('=== STATUS DOS JOBS DE SINCRONIZAÇÃO ===')
  
  const jobs = await prisma.sipeSyncJob.findMany({
    orderBy: { createdAt: 'desc' },
    take: 5
  })
  
  for (const job of jobs) {
    console.log(`\nJob ID: ${job.id}`)
    console.log(`Tipo: ${job.tipo}`)
    console.log(`Status: ${job.status}`)
    console.log(`Fase: ${job.fase}`)
    console.log(`Processado: ${job.processado} / ${job.total}`)
    console.log(`Erros: ${job.erros}`)
    console.log(`Criado em: ${job.createdAt}`)
    console.log(`Última atividade: ${job.ultimaAtividade}`)
    console.log(`Últimos 10 logs:`)
    if (job.log) {
      const lines = job.log.trim().split('\n')
      lines.slice(-10).forEach(line => console.log('  ', line))
    } else {
      console.log('   Nenhum log gravado.')
    }
    console.log('----------------------------------------')
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
