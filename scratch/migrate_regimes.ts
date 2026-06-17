import { PrismaClient } from '@prisma/client'
import * as dotenv from 'dotenv'

dotenv.config()

const prisma = new PrismaClient()

async function main() {
  console.log('=== INICIANDO MIGRAÇÃO ULTRA-RÁPIDA DE REGIMES (V2) ===')

  // 1. Limpar históricos falsos que foram criados a partir do cabeçalho da tabela
  console.log('Limpando registros de históricos falsos de cabeçalho (Código: Codigo)...')
  const deleteResult = await prisma.sipeHistorico.deleteMany({
    where: {
      descricao: {
        contains: 'Código: Codigo'
      }
    }
  })
  console.log(`Total de históricos falsos deletados: ${deleteResult.count}`)

  // 2. Buscar apenados que estão com regime incorreto (incluindo 'SIPE', 'Regime' ou variações)
  const apenados = await prisma.sipeApenadoImportado.findMany({
    where: {
      OR: [
        { regime: { equals: 'SIPE', mode: 'insensitive' } },
        { regime: { contains: 'SIPE', mode: 'insensitive' } },
        { regime: { equals: 'Regime', mode: 'insensitive' } },
        { regime: { contains: 'Regime', mode: 'insensitive' } },
      ]
    },
    select: {
      id: true,
      sipeId: true,
      nome: true,
      regime: true,
    }
  })

  console.log(`Apenados com regime incorreto encontrados: ${apenados.length}`)

  let atualizadosCount = 0

  for (const apenado of apenados) {
    // 3. Buscar históricos do tipo MOVIMENTACAO ordenados por data hora desc (mais recente primeiro)
    const historicos = await prisma.sipeHistorico.findMany({
      where: {
        apenadoId: apenado.id,
        tipo: 'MOVIMENTACAO',
      },
      orderBy: [
        { datahora: 'desc' },
        { createdAt: 'desc' }
      ]
    })

    let regimeMaisRecente: string | null = null

    for (const hist of historicos) {
      // A descrição é no formato: "Movimentação Geral - Código: ... | ... | Regime: Fechado | ..."
      const match = hist.descricao.match(/Regime:\s*([^|]+)/i)
      if (match) {
        const val = match[1].trim()
        if (val && val !== '-----' && val.toUpperCase() !== 'SIPE' && val.toUpperCase() !== 'REGIME') {
          regimeMaisRecente = val
          break // Achou o mais recente válido, interrompe
        }
      }
    }

    if (regimeMaisRecente) {
      console.log(`[${apenado.sipeId}] ${apenado.nome}: Regime corrigido de '${apenado.regime}' para '${regimeMaisRecente}'`)
      
      // Atualiza no SipeApenadoImportado
      await prisma.sipeApenadoImportado.update({
        where: { id: apenado.id },
        data: { regime: regimeMaisRecente }
      })

      // Atualiza no AIPApenado
      await prisma.aIPApenado.update({
        where: { sipeId: apenado.sipeId },
        data: { regime: regimeMaisRecente }
      }).catch(() => {})

      atualizadosCount++
    } else {
      console.log(`[${apenado.sipeId}] ${apenado.nome}: Sem regime válido no histórico. Removendo regime inválido...`)
      
      // Atualiza no SipeApenadoImportado
      await prisma.sipeApenadoImportado.update({
        where: { id: apenado.id },
        data: { regime: null }
      })

      // Atualiza no AIPApenado
      await prisma.aIPApenado.update({
        where: { sipeId: apenado.sipeId },
        data: { regime: null }
      }).catch(() => {})

      atualizadosCount++
    }
  }

  console.log(`\n=== MIGRAÇÃO CONCLUÍDA ===`)
  console.log(`Total de apenados atualizados: ${atualizadosCount}`)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
