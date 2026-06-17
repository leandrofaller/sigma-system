import { PrismaClient } from '@prisma/client'
import * as dotenv from 'dotenv'

dotenv.config()

const prisma = new PrismaClient()

function getCodigo(desc: string): number {
  const match = desc.match(/Código:\s*(\d+)/i)
  return match ? parseInt(match[1], 10) : 0
}

function getMotivo(desc: string): string | null {
  const match = desc.match(/Motivo:\s*([^|]+)/i)
  if (match) {
    const val = match[1].trim()
    return val && val !== '-----' ? val : null
  }
  return null
}

async function main() {
  console.log('=== POPULANDO MOTIVO DA ÚLTIMA MOVIMENTAÇÃO RETROATIVAMENTE ===')
  
  const apenados = await prisma.sipeApenadoImportado.findMany({
    include: {
      historicos: {
        where: { tipo: 'MOVIMENTACAO' }
      }
    }
  })

  console.log(`Encontrados ${apenados.length} apenados no banco local.`)

  let atualizados = 0

  for (const apenado of apenados) {
    if (apenado.historicos.length === 0) continue

    // Ordenar histórico pelo código da movimentação (decrescente)
    const sorted = [...apenado.historicos].sort((a, b) => getCodigo(b.descricao) - getCodigo(a.descricao))
    
    // Encontrar o primeiro motivo válido no histórico ordenado
    let motivoMaisRecente: string | null = null
    for (const h of sorted) {
      const mot = getMotivo(h.descricao)
      if (mot) {
        motivoMaisRecente = mot
        break
      }
    }

    if (motivoMaisRecente && apenado.motivoUltimaMovimentacao !== motivoMaisRecente) {
      console.log(`Apenado ${apenado.nome} (SipeId: ${apenado.sipeId}): Atualizando motivo para "${motivoMaisRecente}"`)
      
      // Atualizar SipeApenadoImportado
      await prisma.sipeApenadoImportado.update({
        where: { id: apenado.id },
        data: { motivoUltimaMovimentacao: motivoMaisRecente }
      })

      // Atualizar AIPApenado se existir
      await prisma.aIPApenado.updateMany({
        where: { sipeId: apenado.sipeId },
        data: { motivoUltimaMovimentacao: motivoMaisRecente }
      })

      atualizados++
    }
  }

  console.log(`=== MIGRACAO RETROATIVA CONCLUÍDA ===`)
  console.log(`Total de apenados atualizados com motivo: ${atualizados}`)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
