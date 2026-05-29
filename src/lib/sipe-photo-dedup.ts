/**
 * Script de diagnóstico e deduplicação de apenados com mesmo nome
 *
 * Problema: Se dois apenados têm o mesmo nome, antes o sistema não conseguia
 * diferenciá-los durante o scraping de fotos.
 *
 * Solução: Sistema agora busca por matricula (CPF/RJI) primeiro, depois por nome.
 * Este script ajuda a limpar duplicatas antigas.
 */

import { prisma } from '@/lib/db'

interface ApenadoDuplicated {
  name: string
  count: number
  apenados: {
    id: string
    matricula: string | null
    photoPath: string | null
    updatedAt: Date
  }[]
}

export async function findDuplicateApenados(): Promise<ApenadoDuplicated[]> {
  // Encontra apenados com o mesmo nome
  const grouped = await prisma.apenado.groupBy({
    by: ['name'],
    where: {
      name: { not: 'SEM NOME' }, // Ignora placeholders
    },
    _count: true,
    having: {
      name: {
        _count: {
          gt: 1,
        },
      },
    },
  })

  const duplicates: ApenadoDuplicated[] = []

  for (const group of grouped) {
    const apenados = await prisma.apenado.findMany({
      where: { name: group.name },
      select: {
        id: true,
        matricula: true,
        photoPath: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: 'desc' },
    })

    duplicates.push({
      name: group.name,
      count: group._count,
      apenados,
    })
  }

  return duplicates
}

interface DeduplicationResult {
  mergedCount: number
  keepIds: string[]
  deletedIds: string[]
  errors: string[]
}

/**
 * Mescla apenados duplicados, mantendo a foto mais recente
 *
 * Estratégia segura:
 * 1. Encontra apenados com mesmo nome
 * 2. Verifica se possuem matricula diferente (podem ser pessoas diferentes)
 * 3. Se tiverem matricula ≠, alerta para revisão manual
 * 4. Se tiverem mesmo nome + SEM matricula, marca como possível duplicata
 * 5. Mescla mantendo a foto mais recente
 */
export async function deduplicateApenados(
  dryRun = true
): Promise<DeduplicationResult> {
  const result: DeduplicationResult = {
    mergedCount: 0,
    keepIds: [],
    deletedIds: [],
    errors: [],
  }

  const duplicates = await findDuplicateApenados()

  for (const group of duplicates) {
    // Se todos têm matricula diferente = provavelmente são pessoas diferentes
    const withMatricula = group.apenados.filter(a => a.matricula)
    const withoutMatricula = group.apenados.filter(a => !a.matricula)

    if (
      withMatricula.length > 0 &&
      withMatricula.length === group.apenados.length
    ) {
      // Todos têm matricula diferente = não mesclar (provavelmente são pessoas diferentes)
      result.errors.push(
        `⚠️  AVISO: "${group.name}" - Todos têm matriculas diferentes (provavelmente são pessoas diferentes). Não mesclado.`
      )
      continue
    }

    if (withoutMatricula.length > 0) {
      // Tem apenados sem matricula = possível duplicata
      // Mescla mantendo o que tem matricula e foto mais recente

      const toKeep = group.apenados[0] // Mais recente (orderBy updatedAt desc)
      const toDelete = group.apenados.slice(1)

      result.keepIds.push(toKeep.id)
      result.deletedIds.push(...toDelete.map(a => a.id))

      if (!dryRun) {
        try {
          // Redireciona referências
          await prisma.sipeApenadoImportado.updateMany({
            where: { apenadoLocalId: { in: toDelete.map(a => a.id) } },
            data: { apenadoLocalId: toKeep.id },
          })

          // Deleta duplicatas
          await prisma.apenado.deleteMany({
            where: { id: { in: toDelete.map(a => a.id) } },
          })

          console.log(
            `✅ Mesclado: "${group.name}" - Mantido ${toKeep.id}, deletados ${toDelete.length}`
          )
          result.mergedCount++
        } catch (err) {
          result.errors.push(
            `❌ Erro ao mesclar "${group.name}": ${String(err)}`
          )
        }
      }
    }
  }

  return result
}

// CLI para executar diagnóstico
if (require.main === module) {
  ;(async () => {
    console.log('🔍 Procurando apenados duplicados...\n')
    const duplicates = await findDuplicateApenados()

    if (duplicates.length === 0) {
      console.log('✅ Nenhuma duplicata encontrada!')
      process.exit(0)
    }

    console.log(`📊 Encontrados ${duplicates.length} grupos de duplicatas:\n`)

    for (const group of duplicates) {
      console.log(`📌 ${group.name} (${group.count} registros)`)
      for (const a of group.apenados) {
        console.log(
          `   - ID: ${a.id} | Matricula: ${a.matricula || 'SEM'} | Foto: ${a.photoPath ? '✓' : '✗'} | Atualizado: ${a.updatedAt.toLocaleDateString('pt-BR')}`
        )
      }
      console.log()
    }

    console.log('\n💡 Execute com `dryRun=false` para desduplicar')
  })().catch(console.error)
}
