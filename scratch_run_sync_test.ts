import { PrismaClient } from '@prisma/client'
import { scrapeApenadoFichaFast } from './src/lib/sipe-scraper.js'
import * as dotenv from 'dotenv'

dotenv.config()

const prisma = new PrismaClient()

async function main() {
  console.log('--- TESTE DE SCRAPING DE APENADO FAST ---')
  const sipeId = 33102 // Zaqueu Alves de Souza

  // 1. Limpar vínculos de advogados existentes para esse apenado para provar que a inserção funciona
  console.log(`Limpando vínculos de advogados antigos para o apenado #${sipeId}...`)
  const apenadoNoDb = await prisma.sipeApenadoImportado.findUnique({
    where: { sipeId }
  })
  if (apenadoNoDb) {
    await prisma.sipeVinculoAdvogado.deleteMany({
      where: { apenadoId: apenadoNoDb.id }
    })
    console.log('Vínculos limpos.')
  }

  // 2. Chamar a função scrapeApenadoFichaFast
  console.log(`Chamando scrapeApenadoFichaFast para o ID #${sipeId}...`)
  
  ;(globalThis as any).__sipeCurrentEngine = 'python-sdk'
  ;(globalThis as any).__sipeFallbackUnidade = '3' // CDPPVH

  try {
    await scrapeApenadoFichaFast(sipeId, 'CDPPVH - Centro de Detenção Provisório de Porto Velho', false)
    console.log('scrapeApenadoFichaFast concluído com sucesso.')
  } catch (err: any) {
    console.error('Erro durante a execução do scraping:', err)
  }

  // 3. Verificar se o vínculo foi recriado
  console.log('\nVerificando resultado no DB...')
  const apenadoFinal = await prisma.sipeApenadoImportado.findUnique({
    where: { sipeId },
    include: {
      vinculosAdvogado: {
        include: {
          advogado: true
        }
      }
    }
  })

  console.log('--- RESULTADO ---')
  if (apenadoFinal) {
    console.log(`Nome: ${apenadoFinal.nome}`)
    console.log(`Total Vínculos Advogado: ${apenadoFinal.vinculosAdvogado.length}`)
    for (const v of apenadoFinal.vinculosAdvogado) {
      console.log(`  - Advogado: ${v.advogado.nome} (OAB: ${v.advogado.oab}, SipeId: ${v.advogado.sipeId}) | Ativo: ${v.ativo}`)
    }
  } else {
    console.log('Apenado não encontrado no banco.')
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
