import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const lastJob = await prisma.sipeSyncJob.findFirst({
    orderBy: { createdAt: 'desc' },
  })

  if (!lastJob) {
    console.log('Nenhum job de sincronizacao encontrado.')
    return
  }

  console.log('=== ULTIMO SYNC JOB DETALHADO ===')
  console.log(`ID: ${lastJob.id}`)
  console.log(`Tipo: ${lastJob.tipo}`)
  console.log(`Status: ${lastJob.status}`)
  console.log(`Fase: ${lastJob.fase}`)
  console.log(`Total: ${lastJob.total}`)
  console.log(`Processado: ${lastJob.processado}`)
  console.log(`Erros: ${lastJob.erros}`)
  console.log(`Criado Em: ${lastJob.createdAt}`)
  console.log(`Finalizado Em: ${lastJob.finalizadoEm}`)
  console.log('---------------------------------')
  console.log('LOG DO JOB:')
  console.log(lastJob.log || '(Nenhum log gravado)')
  console.log('=================================')
}

main().catch(console.error).finally(() => prisma.$disconnect())
