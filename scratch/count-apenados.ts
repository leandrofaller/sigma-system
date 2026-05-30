import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('=== VERIFICANDO DADOS DA TABELA APENADOS ===')
  const total = await prisma.apenado.count()
  const comFoto = await prisma.apenado.count({
    where: { photoPath: { not: null } }
  })
  const comFace = await prisma.apenado.count({
    where: { faceDescriptor: { not: null, not: '' } }
  })
  const comHashSha = await prisma.apenado.count({
    where: { photoHashSha: { not: null } }
  })
  
  console.log(`Total de Apenados (Tabela 'apenados'): ${total}`)
  console.log(`Com photoPath: ${comFoto}`)
  console.log(`Com faceDescriptor: ${comFace}`)
  console.log(`Com photoHashSha: ${comHashSha}`)
}

main().catch(console.error).finally(() => prisma.$disconnect())
