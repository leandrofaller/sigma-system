import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const faccoesCount = await prisma.sipeFaccao.count()
  const apenadosCount = await prisma.sipeApenadoImportado.count()
  const jobsCount = await prisma.sipeSyncJob.count()

  console.log('=== ESTADO ATUAL DO BANCO ===')
  console.log(`Facções: ${faccoesCount}`)
  console.log(`Apenados Importados: ${apenadosCount}`)
  console.log(`Sync Jobs: ${jobsCount}`)

  if (faccoesCount > 0) {
    const list = await prisma.sipeFaccao.findMany({ take: 5 })
    console.log('Exemplos de facções no banco:')
    list.forEach(f => console.log(`  - ID SIPE: ${f.sipeId} | Nome: ${f.nome}`))
  }
}

main().catch(console.error).finally(() => prisma.$disconnect())
