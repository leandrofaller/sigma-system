import { scrapeFaccoes } from '../src/lib/sipe-scraper'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function test() {
  console.log('--- INICIANDO TESTE DE IMPORTAÇÃO DE FACÇÕES ---')
  
  // Limpar facções antigas se houver
  const deletadas = await prisma.sipeFaccao.deleteMany({})
  console.log(`Limpou ${deletadas.count} facções anteriores do banco local.`)

  try {
    await scrapeFaccoes()
    console.log('--- SUCESSO! ---')
    
    const faccoes = await prisma.sipeFaccao.findMany()
    console.log(`Total de facções gravadas no banco: ${faccoes.length}`)
    for (const f of faccoes) {
      console.log(`  SIPE ID ${f.sipeId}: ${f.nome}`)
    }
  } catch (err) {
    console.error('--- FALHA NO TESTE ---')
    console.error(err)
  } finally {
    await prisma.$disconnect()
  }
}

test()
