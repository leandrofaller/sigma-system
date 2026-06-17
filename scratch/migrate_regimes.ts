import { PrismaClient } from '@prisma/client'
import * as dotenv from 'dotenv'

dotenv.config()

const prisma = new PrismaClient()

async function main() {
  console.log('=== INICIANDO MIGRAÇÃO E CORREÇÃO DE REGIMES ===')

  // 1. Buscar todos os apenados importados
  const apenados = await prisma.sipeApenadoImportado.findMany({
    select: {
      id: true,
      sipeId: true,
      nome: true,
      regime: true,
    }
  })

  console.log(`Total de apenados importados encontrados: ${apenados.length}`)

  let atualizadosCount = 0

  for (const apenado of apenados) {
    // 2. Buscar históricos do tipo MOVIMENTACAO ordenados por data hora desc (mais recente primeiro)
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

    if (historicos.length === 0) {
      // Se o regime atual for "SIPE" e não houver histórico, vamos pelo menos remover o "SIPE" e deixar nulo
      if (apenado.regime === 'SIPE') {
        console.log(`[${apenado.sipeId}] ${apenado.nome}: Sem histórico. Removendo regime 'SIPE' inválido...`)
        await prisma.sipeApenadoImportado.update({
          where: { id: apenado.id },
          data: { regime: null }
        })
        await prisma.aIPApenado.update({
          where: { sipeId: apenado.sipeId },
          data: { regime: null }
        }).catch(() => {})
        atualizadosCount++
      }
      continue
    }

    // 3. Tentar extrair o regime da movimentação mais recente que tenha um regime válido
    let regimeMaisRecente: string | null = null

    for (const hist of historicos) {
      // A descrição é no formato: "Movimentação Geral - Código: ... | ... | Regime: Fechado | ..."
      const match = hist.descricao.match(/Regime:\s*([^|]+)/i)
      if (match) {
        const val = match[1].trim()
        if (val && val !== '-----' && val.toUpperCase() !== 'SIPE') {
          regimeMaisRecente = val
          break // Achou o mais recente válido, interrompe
        }
      }
    }

    if (regimeMaisRecente) {
      // 4. Se o regime encontrado for diferente do atual ou o atual for 'SIPE', atualiza
      if (apenado.regime !== regimeMaisRecente || apenado.regime === 'SIPE') {
        console.log(`[${apenado.sipeId}] ${apenado.nome}: Regime alterado de '${apenado.regime}' para '${regimeMaisRecente}'`)
        
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
      }
    } else {
      // Se não encontrou nenhum regime no histórico e o regime atual era 'SIPE'
      if (apenado.regime === 'SIPE') {
        console.log(`[${apenado.sipeId}] ${apenado.nome}: Sem regime válido no histórico. Removendo regime 'SIPE' inválido...`)
        await prisma.sipeApenadoImportado.update({
          where: { id: apenado.id },
          data: { regime: null }
        })
        await prisma.aIPApenado.update({
          where: { sipeId: apenado.sipeId },
          data: { regime: null }
        }).catch(() => {})
        atualizadosCount++
      }
    }
  }

  console.log(`\n=== MIGRAÇÃO CONCLUÍDA ===`)
  console.log(`Total de apenados atualizados: ${atualizadosCount}`)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
