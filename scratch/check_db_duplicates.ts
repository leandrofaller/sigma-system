import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('=== VERIFICANDO DUPLICATAS DE ADVOGADOS ===')
  const advogados = await prisma.sipeAdvogado.findMany({
    include: {
      vinculos: {
        include: {
          apenado: true
        }
      }
    }
  })

  const advMapByName = new Map<string, typeof advogados>()
  for (const adv of advogados) {
    const nomeNorm = adv.nome.trim().toUpperCase()
    if (!advMapByName.has(nomeNorm)) {
      advMapByName.set(nomeNorm, [])
    }
    advMapByName.get(nomeNorm)!.push(adv)
  }

  let dupAdvsCount = 0
  for (const [nome, list] of advMapByName.entries()) {
    if (list.length > 1) {
      dupAdvsCount++
      console.log(`Advogado duplicado: "${nome}"`)
      for (const adv of list) {
        console.log(`  - ID: ${adv.id} | SipeId: ${adv.sipeId} | OAB: ${adv.oab} | Vínculos com apenados: ${adv.vinculos.map(v => `${v.apenado.nome} (ID ${v.apenado.sipeId})`).join(', ')}`)
      }
    }
  }
  console.log(`Total de advogados com duplicatas: ${dupAdvsCount}`)

  console.log('\n=== VERIFICANDO DUPLICATAS DE VISITANTES ===')
  const visitantes = await prisma.sipeVisitante.findMany({
    include: {
      vinculos: {
        include: {
          apenado: true
        }
      }
    }
  })

  const visMapByName = new Map<string, typeof visitantes>()
  for (const vis of visitantes) {
    const nomeNorm = vis.nome.trim().toUpperCase()
    if (!visMapByName.has(nomeNorm)) {
      visMapByName.set(nomeNorm, [])
    }
    visMapByName.get(nomeNorm)!.push(vis)
  }

  let dupVisCount = 0
  for (const [nome, list] of visMapByName.entries()) {
    if (list.length > 1) {
      dupVisCount++
      console.log(`Visitante duplicado: "${nome}"`)
      for (const vis of list) {
        console.log(`  - ID: ${vis.id} | CPF: ${vis.cpf} | Vínculos com apenados: ${vis.vinculos.map(v => `${v.apenado.nome} (ID ${v.apenado.sipeId})`).join(', ')}`)
      }
    }
  }
  console.log(`Total de visitantes com duplicatas: ${dupVisCount}`)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
