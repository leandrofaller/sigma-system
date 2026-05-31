import { prisma } from '../src/lib/db'

async function main() {
  const jobs = await prisma.sipeSyncJob.findMany({
    orderBy: { createdAt: 'desc' },
    take: 15
  })
  
  console.log('--- LOGS DE SYNC JOBS ---')
  for (const job of jobs) {
    console.log(`ID: ${job.id} | Tipo: ${job.tipo} | Status: ${job.status} | Criado: ${job.createdAt}`)
    if (job.log) {
      console.log('Log snippet:')
      // Pega linhas interessantes dos logs, como as que contêm "facção" ou "facções"
      const lines = job.log.split('\n')
      const matchedLines = lines.filter(line => 
        line.toLowerCase().includes('fac') || 
        line.toLowerCase().includes('companheiro') ||
        line.toLowerCase().includes('opç')
      )
      if (matchedLines.length > 0) {
        matchedLines.slice(0, 10).forEach(l => console.log('  ', l.trim()))
      } else {
        console.log('  (Sem linhas combinando sobre facções)')
      }
      console.log('------------------------')
    }
  }
}

main()
  .catch(err => console.error(err))
  .finally(() => prisma.$disconnect())
