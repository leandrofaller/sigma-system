import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  console.log('Buscando jobs de sincronização travados (RUNNING/PENDING)...')
  const activeJobs = await prisma.sipeSyncJob.findMany({
    where: { status: { in: ['RUNNING', 'PENDING'] } }
  })

  console.log(`Encontrados ${activeJobs.length} jobs ativos.`)

  if (activeJobs.length > 0) {
    const updated = await prisma.sipeSyncJob.updateMany({
      where: { status: { in: ['RUNNING', 'PENDING'] } },
      data: {
        status: 'INTERRUPTED',
        finalizadoEm: new Date(),
        log: 'Destravamento emergencial: status atualizado para INTERRUPTED'
      }
    })
    console.log(`✅ Sucesso! ${updated.count} jobs foram destravados no banco de dados.`)
  } else {
    console.log('Nenhum job travado encontrado no banco.')
  }
}

main().catch(console.error).finally(() => prisma.$disconnect())
