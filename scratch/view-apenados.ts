import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  // Vamos buscar informações sobre o advogado 403
  const adv = await prisma.sipeAdvogado.findUnique({
    where: { sipeId: 403 },
    include: {
      vinculos: {
        include: {
          apenado: true
        }
      }
    }
  })

  console.log('Advogado 403 no banco:')
  console.log(JSON.stringify(adv, null, 2))

  // Vamos ver se existem apenados importados com IDs que parecem CPFs ou muito grandes
  const apenadosGrandes = await prisma.sipeApenadoImportado.findMany({
    where: {
      sipeId: {
        gt: 50000000 // IDs maiores que 50 milhões
      }
    },
    take: 10
  })
  console.log('Apenados com sipeId > 50M:')
  console.log(JSON.stringify(apenadosGrandes, null, 2))
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
