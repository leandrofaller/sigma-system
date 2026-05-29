import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const faccoes = await prisma.sipeFaccao.findMany({
    orderBy: { nome: 'asc' }
  })

  console.log('=== FACCOES NO BANCO ===')
  console.log(`Total: ${faccoes.length}`)
  faccoes.forEach(f => {
    console.log(`ID (CUID): ${f.id} | SIPE ID: ${f.sipeId} | Nome: ${f.nome} | Sigla: ${f.sigla} | Ativa: ${f.ativa}`)
  })
}

main().catch(console.error).finally(() => prisma.$disconnect())
