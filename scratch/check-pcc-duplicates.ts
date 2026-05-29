import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const faccoes = await prisma.sipeFaccao.findMany({
    include: {
      _count: {
        select: { apenados: true }
      }
    }
  })

  console.log('=== TODAS AS FACÇÕES ===')
  for (const f of faccoes) {
    console.log(`ID: ${f.id} | SIPE ID: ${f.sipeId} | Nome: "${f.nome}" | Sigla: "${f.sigla}" | Apenados Count: ${f._count.apenados}`)
  }
}

main().catch(console.error).finally(() => prisma.$disconnect())
