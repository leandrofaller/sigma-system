import { PrismaClient } from '@prisma/client'
import * as dotenv from 'dotenv'

dotenv.config()

const prisma = new PrismaClient()

async function main() {
  console.log('=== BUSCANDO APENADOS COM SITUAÇÃO "*" ===')

  const apenados = await prisma.sipeApenadoImportado.findMany({
    where: {
      situacao: '*'
    },
    select: {
      id: true,
      sipeId: true,
      nome: true,
      situacao: true,
      unidade: true,
      rji: true
    }
  })

  console.log(`Encontrados: ${apenados.length} apenados com situação '*'`)

  for (const a of apenados) {
    console.log(`\nSipeId: ${a.sipeId} | Nome: ${a.nome} | Unidade: ${a.unidade}`)
    
    // Buscar históricos para ver se houve alguma movimentação ou pista
    const historicos = await prisma.sipeHistorico.findMany({
      where: { apenadoId: a.id },
      orderBy: { datahora: 'desc' },
      take: 3
    })

    console.log('Históricos recentes:')
    for (const h of historicos) {
      console.log(`  - [${h.tipo}] ${h.datahora ? h.datahora.toISOString().substring(0, 10) : 'Sem data'}: ${h.descricao}`)
    }
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
