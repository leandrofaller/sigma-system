import { PrismaClient } from '@prisma/client'
import * as dotenv from 'dotenv'

dotenv.config()

const prisma = new PrismaClient()

async function main() {
  const rji = '18086247395'
  console.log(`Buscando apenado com RJI: ${rji}`)

  const sipeApenado = await prisma.sipeApenadoImportado.findFirst({
    where: { rji },
    include: {
      faccao: true,
      historicos: {
        where: { tipo: 'MOVIMENTACAO' },
        orderBy: { datahora: 'desc' }
      }
    }
  })

  if (sipeApenado) {
    console.log('\n--- SipeApenadoImportado ---')
    console.log(`ID: ${sipeApenado.id}`)
    console.log(`SipeId: ${sipeApenado.sipeId}`)
    console.log(`Nome: ${sipeApenado.nome}`)
    console.log(`Regime: ${sipeApenado.regime}`)
    console.log(`Unidade: ${sipeApenado.unidade}`)
    console.log(`Cela: ${sipeApenado.cela}`)
    console.log(`Históricos de movimentações encontrados: ${sipeApenado.historicos.length}`)
    if (sipeApenado.historicos.length > 0) {
      console.log('Movimentação mais recente:')
      console.log(`  Data: ${sipeApenado.historicos[0].datahora}`)
      console.log(`  Descrição: ${sipeApenado.historicos[0].descricao}`)
    }
  } else {
    console.log('Nenhum apenado encontrado em SipeApenadoImportado com este RJI.')
  }

  const aipApenado = await prisma.aIPApenado.findFirst({
    where: { rji },
    include: {
      sipeApenado: true
    }
  })

  if (aipApenado) {
    console.log('\n--- AIPApenado ---')
    console.log(`ID: ${aipApenado.id}`)
    console.log(`SipeId: ${aipApenado.sipeId}`)
    console.log(`Nome: ${aipApenado.nome}`)
    console.log(`Regime: ${aipApenado.regime}`)
    console.log(`Unidade: ${aipApenado.unidade}`)
    console.log(`Cela: ${aipApenado.cela}`)
    console.log(`facaoRealNome (Inteligência): ${aipApenado.facaoRealNome}`)
  } else {
    console.log('Nenhum apenado encontrado em AIPApenado com este RJI.')
  }

  const apenadoLocal = await prisma.apenado.findFirst({
    where: { matricula: rji }
  })

  if (apenadoLocal) {
    console.log('\n--- Apenado (Local) ---')
    console.log(`ID: ${apenadoLocal.id}`)
    console.log(`Name: ${apenadoLocal.name}`)
    console.log(`Unidade: ${apenadoLocal.unidade}`)
    console.log(`Facao: ${apenadoLocal.faccao}`)
  } else {
    console.log('Nenhum apenado encontrado em Apenado com este RJI.')
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
