import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const jobs = await prisma.sipeSyncJob.findMany({
    where: { tipo: 'FACCOES' },
    orderBy: { createdAt: 'desc' },
    take: 10
  })

  console.log('=== LISTA DE JOBS DE FACCOES ===')
  jobs.forEach(j => {
    console.log(`ID: ${j.id} | Status: ${j.status} | Criado em: ${j.createdAt.toISOString()} | Finalizado em: ${j.finalizadoEm?.toISOString() || 'N/A'} | Erro/Log: ${j.log ? j.log.substring(0, 100) + '...' : 'N/A'}`)
  })
}

main().catch(console.error).finally(() => prisma.$disconnect())
