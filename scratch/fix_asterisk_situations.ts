import { PrismaClient } from '@prisma/client'
import * as dotenv from 'dotenv'

dotenv.config()

const prisma = new PrismaClient()

async function main() {
  console.log('=== CORRIGINDO SITUAÇÕES "*" PARA NULL ===')

  // 1. Atualizar em SipeApenadoImportado
  const updateImportados = await prisma.sipeApenadoImportado.updateMany({
    where: {
      situacao: '*'
    },
    data: {
      situacao: null
    }
  })

  console.log(`Atualizados em SipeApenadoImportado: ${updateImportados.count} registros.`)

  // 2. Atualizar em AIPApenado
  const updateAip = await prisma.aIPApenado.updateMany({
    where: {
      situacao: '*'
    },
    data: {
      situacao: null
    }
  })

  console.log(`Atualizados em AIPApenado: ${updateAip.count} registros.`)

  console.log('=== CORREÇÃO CONCLUÍDA ===')
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
