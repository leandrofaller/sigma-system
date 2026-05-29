import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const apenadosComFaccao = await prisma.sipeApenadoImportado.findMany({
    where: {
      faccaoId: { not: null }
    },
    include: {
      faccao: true
    },
    take: 20
  })

  console.log('=== APENADOS COM FACÇÃO NO BANCO ===')
  apenadosComFaccao.forEach(a => {
    console.log(`Apenado: ${a.nome} (SIPE ID: ${a.sipeId}) | Facção: ${a.faccao?.nome} (SIPE ID: ${a.faccao?.sipeId})`)
  })

  const apenadosSemFaccao = await prisma.sipeApenadoImportado.findMany({
    where: {
      faccaoId: null
    },
    take: 10
  })

  console.log('\n=== ALGUNS APENADOS SEM FACÇÃO NO BANCO ===')
  apenadosSemFaccao.forEach(a => {
    console.log(`Apenado: ${a.nome} (SIPE ID: ${a.sipeId})`)
  })
}

main().catch(console.error).finally(() => prisma.$disconnect())
