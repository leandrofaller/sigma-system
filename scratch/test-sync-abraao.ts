import { scrapeApenadoFichaFast } from '../src/lib/sipe-scraper'
import { prisma } from '../src/lib/db'

// Configura a engine como python-sdk
globalThis.__sipeCurrentEngine = 'python-sdk'

async function main() {
  const sipeId = 31417 // ABRAÃO DE ALMEIDA
  
  try {
    console.log(`Iniciando teste de sincronização rápida para o apenado ID #${sipeId}...`)
    
    // Roda com useSearch = true, que é como o scraping global roda (busca pelo ID na listagem)
    await scrapeApenadoFichaFast(sipeId, null, true)
    
    console.log('\nSincronização concluída!')
    
    // Consulta o banco para ver se salvou
    const apenado = await prisma.sipeApenadoImportado.findUnique({
      where: { sipeId }
    })
    console.log('\nResultado no banco:')
    console.log(JSON.stringify(apenado, null, 2))
    
    const historicos = await prisma.sipeHistorico.findMany({
      where: { apenadoId: apenado?.id },
      orderBy: { datahora: 'desc' }
    })
    console.log(`\nHistóricos gravados (${historicos.length}):`)
    historicos.forEach(h => {
      console.log(`- Tipo: ${h.tipo} | Unidade: ${h.unidade} | Descrição: ${h.descricao}`)
    })
    
  } catch (err: any) {
    console.error('\n❌ Erro durante a sincronização:', err.message || err)
    if (err.stack) console.error(err.stack)
  } finally {
    await prisma.$disconnect()
  }
}

main()
