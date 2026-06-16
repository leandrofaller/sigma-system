import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// Replica das funções de normalização
function normalizeOAB(oab: string | null | undefined): string | null {
  if (!oab) return null
  let cleaned = oab.trim().toUpperCase()
  cleaned = cleaned.replace(/\./g, '')
  cleaned = cleaned.replace(/[-\s]/g, '/')
  cleaned = cleaned.replace(/\/+/g, '/')
  const match = cleaned.match(/^(\d+[A-Z]?)\/?([A-Z]{2})$/)
  if (match) {
    return `${match[1]}/${match[2]}`
  }
  return cleaned
}

function normalizeCPF(cpf: string | null | undefined): string | null {
  if (!cpf) return null
  const cleaned = cpf.replace(/\D/g, '')
  return cleaned.length === 11 ? cleaned : null
}

async function main() {
  console.log('=== INICIANDO HIGIENIZAÇÃO DE CPFS E OABS NO DB ===')

  // 1. Normalizar todas as OABs dos advogados existentes
  const advogados = await prisma.sipeAdvogado.findMany()
  console.log(`Encontrados ${advogados.length} advogados para normalizar OAB.`)
  for (const adv of advogados) {
    const normOab = normalizeOAB(adv.oab)
    if (normOab !== adv.oab) {
      await prisma.sipeAdvogado.update({
        where: { id: adv.id },
        data: { oab: normOab }
      })
    }
  }

  // 2. Normalizar todos os CPFs dos visitantes existentes
  const visitantes = await prisma.sipeVisitante.findMany()
  console.log(`Encontrados ${visitantes.length} visitantes para normalizar CPF.`)
  for (const vis of visitantes) {
    const normCpf = normalizeCPF(vis.cpf)
    if (normCpf !== vis.cpf) {
      await prisma.sipeVisitante.update({
        where: { id: vis.id },
        data: { cpf: normCpf }
      })
    }
  }

  console.log('Higienização concluída.')

  console.log('\n=== MERGIN DUPLICATAS DE ADVOGADOS ===')
  // Recarrega todos os advogados pós-normalização
  const freshAdvs = await prisma.sipeAdvogado.findMany({
    include: { vinculos: true }
  })

  // Agrupar por Nome e por OAB (se houver)
  const advGroups = new Map<string, typeof freshAdvs>()
  for (const adv of freshAdvs) {
    // Agrupa por OAB se houver, senão pelo Nome norm
    const key = adv.oab ? `OAB:${adv.oab}` : `NOME:${adv.nome.trim().toUpperCase()}`
    if (!advGroups.has(key)) {
      advGroups.set(key, [])
    }
    advGroups.get(key)!.push(adv)
  }

  let mergedAdvsCount = 0
  for (const [key, list] of advGroups.entries()) {
    if (list.length > 1) {
      // Ordena por prioridade: sipeId positivo primeiro (ID real), depois maior número de vínculos
      list.sort((a, b) => {
        const aReal = a.sipeId > 0 ? 1 : 0
        const bReal = b.sipeId > 0 ? 1 : 0
        if (aReal !== bReal) return bReal - aReal
        return b.vinculos.length - a.vinculos.length
      })

      const primary = list[0]
      const secondaryList = list.slice(1)

      console.log(`Mesclando ${secondaryList.length} duplicatas do advogado "${primary.nome}" (OAB: ${primary.oab}) no ID primário ${primary.id}`)

      for (const secondary of secondaryList) {
        // Redireciona os vínculos de apenados
        for (const vinculo of secondary.vinculos) {
          // Verifica se o apenado já tem vínculo com o primário
          const existingVinculo = await prisma.sipeVinculoAdvogado.findUnique({
            where: {
              apenadoId_advogadoId: {
                apenadoId: vinculo.apenadoId,
                advogadoId: primary.id
              }
            }
          })

          if (existingVinculo) {
            // Se já existe o vínculo, apenas deletamos o da duplicata
            await prisma.sipeVinculoAdvogado.delete({
              where: { id: vinculo.id }
            })
          } else {
            // Senão, atualizamos para apontar para o primário
            await prisma.sipeVinculoAdvogado.update({
              where: { id: vinculo.id },
              data: { advogadoId: primary.id }
            })
          }
        }

        // Deleta o registro duplicado do advogado
        await prisma.sipeAdvogado.delete({
          where: { id: secondary.id }
        })
        mergedAdvsCount++
      }
    }
  }
  console.log(`Total de advogados duplicados limpos: ${mergedAdvsCount}`)

  console.log('\n=== MERGIN DUPLICATAS DE VISITANTES ===')
  // Recarrega todos os visitantes pós-normalização
  const freshVis = await prisma.sipeVisitante.findMany({
    include: { vinculos: true }
  })

  // Agrupar por Nome e por CPF
  const visGroups = new Map<string, typeof freshVis>()
  for (const vis of freshVis) {
    const key = vis.cpf ? `CPF:${vis.cpf}` : `NOME:${vis.nome.trim().toUpperCase()}`
    if (!visGroups.has(key)) {
      visGroups.set(key, [])
    }
    visGroups.get(key)!.push(vis)
  }

  let mergedVisCount = 0
  for (const [key, list] of visGroups.entries()) {
    if (list.length > 1) {
      // Ordena por prioridade: tem CPF, depois maior número de vínculos
      list.sort((a, b) => {
        const aCpf = a.cpf ? 1 : 0
        const bCpf = b.cpf ? 1 : 0
        if (aCpf !== bCpf) return bCpf - aCpf
        return b.vinculos.length - a.vinculos.length
      })

      const primary = list[0]
      const secondaryList = list.slice(1)

      console.log(`Mesclando ${secondaryList.length} duplicatas do visitante "${primary.nome}" (CPF: ${primary.cpf}) no ID primário ${primary.id}`)

      for (const secondary of secondaryList) {
        // Redireciona os vínculos de apenados
        for (const vinculo of secondary.vinculos) {
          // Verifica se o apenado já tem vínculo com o primário
          const existingVinculo = await prisma.sipeVinculoVisitante.findUnique({
            where: {
              apenadoId_visitanteId: {
                apenadoId: vinculo.apenadoId,
                visitanteId: primary.id
              }
            }
          })

          if (existingVinculo) {
            // Se já existe o vínculo, apenas deletamos o da duplicata
            await prisma.sipeVinculoVisitante.delete({
              where: { id: vinculo.id }
            })
          } else {
            // Senão, atualizamos para apontar para o primário
            await prisma.sipeVinculoVisitante.update({
              where: { id: vinculo.id },
              data: { visitanteId: primary.id }
            })
          }
        }

        // Deleta o registro duplicado do visitante
        await prisma.sipeVisitante.delete({
          where: { id: secondary.id }
        })
        mergedVisCount++
      }
    }
  }
  console.log(`Total de visitantes duplicados limpos: ${mergedVisCount}`)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
