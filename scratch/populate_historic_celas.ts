import { PrismaClient } from '@prisma/client'
import * as dotenv from 'dotenv'

dotenv.config()

const prisma = new PrismaClient()

async function main() {
  console.log('=== POPULANDO UNIDADE E CELA ATUAL RETROATIVAMENTE ===')
  
  const apenados = await prisma.sipeApenadoImportado.findMany({
    include: {
      historicos: {
        where: { tipo: 'TRANSFERENCIA' },
        orderBy: { datahora: 'desc' }
      }
    }
  })

  console.log(`Encontrados ${apenados.length} apenados no banco local.`)

  let atualizados = 0

  for (const apenado of apenados) {
    if (apenado.historicos.length === 0) continue

    // O histórico já vem ordenado por datahora desc do banco.
    // Vamos procurar a transferência mais recente que possua dados válidos de cela ou unidade
    let unidadeMaisRecente: string | null = null
    let celaMaisRecente: string | null = null

    for (const h of apenado.historicos) {
      if (!unidadeMaisRecente && h.unidade && h.unidade !== '-----') {
        unidadeMaisRecente = h.unidade
      }
      if (!celaMaisRecente && h.cela && h.cela !== '-----') {
        celaMaisRecente = h.cela
      }
      if (unidadeMaisRecente && celaMaisRecente) break
    }

    const needsUpdate = 
      (unidadeMaisRecente && apenado.unidade !== unidadeMaisRecente) ||
      (celaMaisRecente && apenado.cela !== celaMaisRecente)

    if (needsUpdate) {
      console.log(`Apenado ${apenado.nome} (SipeId: ${apenado.sipeId}):`)
      if (unidadeMaisRecente && apenado.unidade !== unidadeMaisRecente) {
        console.log(`  - Unidade antiga: "${apenado.unidade}" -> Nova: "${unidadeMaisRecente}"`)
      }
      if (celaMaisRecente && apenado.cela !== celaMaisRecente) {
        console.log(`  - Cela antiga: "${apenado.cela}" -> Nova: "${celaMaisRecente}"`)
      }

      const updateData: { unidade?: string; cela?: string } = {}
      if (unidadeMaisRecente) updateData.unidade = unidadeMaisRecente
      if (celaMaisRecente) updateData.cela = celaMaisRecente

      // Atualizar SipeApenadoImportado
      await prisma.sipeApenadoImportado.update({
        where: { id: apenado.id },
        data: updateData
      })

      // Atualizar AIPApenado se existir
      await prisma.aIPApenado.updateMany({
        where: { sipeId: apenado.sipeId },
        data: updateData
      })

      atualizados++
    }
  }

  console.log(`=== POPULAÇÃO RETROATIVA CONCLUÍDA ===`)
  console.log(`Total de apenados atualizados com localidade correta: ${atualizados}`)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
