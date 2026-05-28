import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('--- Unique units from SipeSyncJob ---')
  const jobs = await prisma.sipeSyncJob.findMany({
    select: { unidade: true, unidadeNome: true },
    distinct: ['unidade'],
  })
  console.log(JSON.stringify(jobs, null, 2))

  console.log('--- Unique units from SipeApenadoImportado ---')
  const apenados = await prisma.sipeApenadoImportado.findMany({
    select: { unidade: true },
    distinct: ['unidade'],
  })
  console.log(JSON.stringify(apenados, null, 2))
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
