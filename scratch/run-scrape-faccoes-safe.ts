import { scrapeFaccoes } from '../src/lib/sipe-scraper'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function test() {
  console.log('--- INICIANDO TESTE SEGURO DE IMPORTAÇÃO DE FACÇÕES ---')
  
  try {
    await scrapeFaccoes()
    console.log('--- SUCESSO NO SCRAPING! ---')
    
    const faccoes = await prisma.sipeFaccao.findMany({
      orderBy: { nome: 'asc' }
    })
    console.log(`Total de facções no banco agora: ${faccoes.length}`)
    for (const f of faccoes) {
      console.log(`  SIPE ID ${f.sipeId}: ${f.nome} (${f.sigla || 'Sem sigla'}) - Cor: ${f.cor}`)
    }
  } catch (err) {
    console.error('--- FALHA NO TESTE ---')
    console.error(err)
  } finally {
    await prisma.$disconnect()
  }
}

test()
