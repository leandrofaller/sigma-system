import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const visitantesCount = await prisma.sipeVisitante.count()
  const vinculosCount = await prisma.sipeVinculoVisitante.count()

  console.log(`=== VISITANTES NO BANCO ===`)
  console.log(`Visitantes: ${visitantesCount}`)
  console.log(`Vinculos: ${vinculosCount}`)

  if (visitantesCount > 0) {
    const list = await prisma.sipeVisitante.findMany({ take: 20 })
    console.log('Exemplos de visitantes no banco:')
    list.forEach(v => {
      console.log(`  - ID: ${v.id} | Nome: ${v.nome} | CPF: ${v.cpf} | FotoPath: ${v.photoPath}`)
    })
  }
}

main().catch(console.error).finally(() => prisma.$disconnect())
