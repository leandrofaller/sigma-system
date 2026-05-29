import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const lastFailedJob = await prisma.sipeSyncJob.findFirst({
    where: { 
      tipo: 'FACCOES',
      status: 'FAILED'
    },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      status: true,
      log: true,
      createdAt: true,
      finalizadoEm: true
    }
  })

  if (lastFailedJob) {
    console.log('=== ÚLTIMO SYNC FAILED DE FACCOES ===\n')
    console.log(`Criado: ${lastFailedJob.createdAt}`)
    console.log(`Finalizado: ${lastFailedJob.finalizadoEm}`)
    console.log(`\nLog completo:\n${lastFailedJob.log}`)
  } else {
    console.log('Nenhum sync job failed de faccoes encontrado')
  }
}

main().catch(console.error).finally(() => prisma.$disconnect())
