import { prisma } from '@/lib/db'
import { nomeParaIbge, normalizeMunicipioNome } from '@/lib/municipios-rondonia'
import { loadCustomUnidadesAtivas } from '@/lib/unidades-enderecos-catalog'
import { geoMapaFromUnidadeEndereco, resolveUnidadeEndereco } from '@/lib/unidades-enderecos-resolver'
import { normalizeSearch } from '@/lib/search'

export interface UnidadePresosResumo {
  unidade: string
  totalApenados: number
}

/**
 * Totais da aba Unidades Prisionais (tabela isolada sipeApenadoUnidadePrisional),
 * agregados por município — mesma base do dashboard de unidades.
 */
export interface ApenadosMunicipioUnidadesPrisionais {
  municipio: string
  municipioIbge: number | null
  /** Soma de presos no município (filtro sexo not null, igual ao stats da aba). */
  totalApenados: number
  /** Detalhamento por unidade — espelha o ranking da aba Unidades Prisionais. */
  unidades: UnidadePresosResumo[]
}

/** Rótulos de unidade que não representam prisão real em RO. */
const UNIDADE_LIXO = new Set(
  [
    'SIM',
    'NAO',
    'NÃO',
    'NAO INFORMADO',
    'NÃO INFORMADO',
    'UNIDADE - AJUSTES SISTEMA',
    'AJUSTES SISTEMA',
  ].map((s) => normalizeSearch(s).replace(/[^A-Z0-9]+/g, ' ').replace(/\s+/g, ' ').trim())
)

function isUnidadeLixo(unidade: string | null | undefined): boolean {
  if (!unidade?.trim()) return true
  const key = normalizeSearch(unidade).replace(/[^A-Z0-9]+/g, ' ').replace(/\s+/g, ' ').trim()
  if (UNIDADE_LIXO.has(key)) return true
  // Unidades federais / fora de RO
  if (key.includes('FEDERAL') && (key.includes('CAMPO GRANDE') || key.includes('BRASILIA') || key.includes('CATANDUVAS'))) {
    return true
  }
  return false
}

function resolveMunicipioFromCidade(
  cidade: string | null | undefined,
  uf: string | null | undefined
): { municipio: string; municipioIbge: number } | null {
  if (!cidade?.trim()) return null
  const ufNorm = (uf || '').trim().toUpperCase()
  // Aceita RO, vazio ou nulo (muitos registros sem UF mas cidade de RO)
  if (ufNorm && ufNorm !== 'RO' && ufNorm !== 'RONDONIA') return null

  const municipio = normalizeMunicipioNome(cidade)
  const municipioIbge = nomeParaIbge(municipio)
  if (!municipioIbge) return null
  return { municipio, municipioIbge }
}

function addToMunMap(
  munMap: Map<string, ApenadosMunicipioUnidadesPrisionais>,
  municipio: string,
  municipioIbge: number | null,
  qtd: number,
  nomeUnidade: string
) {
  const key = String(municipioIbge ?? normalizeMunicipioNome(municipio))
  let row = munMap.get(key)
  if (!row) {
    row = {
      municipio: normalizeMunicipioNome(municipio),
      municipioIbge,
      totalApenados: 0,
      unidades: [],
    }
    munMap.set(key, row)
  }
  row.totalApenados += qtd
  const existing = row.unidades.find(
    (u) => u.unidade.toLowerCase() === nomeUnidade.toLowerCase()
  )
  if (existing) existing.totalApenados += qtd
  else row.unidades.push({ unidade: nomeUnidade, totalApenados: qtd })
}

/**
 * Total de presos por município a partir da aba Unidades Prisionais.
 *
 * Estratégia (nessa ordem):
 * 1) Unidade prisional resolvida no catálogo → município da comarca/sede
 * 2) Fallback: campo `cidade` quando for município válido de RO
 *    (a maior parte dos registros da tabela vem com unidade nula)
 *
 * Mantém o mesmo filtro `sexo not null` do dashboard da aba.
 */
export async function buildApenadosUnidadesPrisionaisPorMunicipio(): Promise<
  ApenadosMunicipioUnidadesPrisionais[]
> {
  const [rows, customCatalog] = await Promise.all([
    prisma.sipeApenadoUnidadePrisional.groupBy({
      by: ['unidade', 'cidade', 'uf'],
      where: { sexo: { not: null } },
      _count: { id: true },
    }),
    loadCustomUnidadesAtivas(),
  ])

  const munMap = new Map<string, ApenadosMunicipioUnidadesPrisionais>()

  for (const item of rows) {
    const qtd = item._count.id
    if (qtd <= 0) continue

    const unidadeRaw = item.unidade?.trim() || null
    let mapped = false

    // 1) Via unidade no catálogo (fonte preferencial)
    if (unidadeRaw && !isUnidadeLixo(unidadeRaw)) {
      const entry = resolveUnidadeEndereco(unidadeRaw, customCatalog)
      if (entry) {
        const geo = geoMapaFromUnidadeEndereco(entry)
        if (geo.municipio) {
          const municipio = normalizeMunicipioNome(geo.municipio)
          const municipioIbge = geo.municipioIbge ?? nomeParaIbge(municipio)
          addToMunMap(
            munMap,
            municipio,
            municipioIbge,
            qtd,
            entry.unidade || unidadeRaw
          )
          mapped = true
        }
      }
    }

    if (mapped) continue

    // 2) Fallback: cidade residencial/local quando é município de RO
    //    Cobre ~12k registros com unidade nula na base de Unidades Prisionais.
    const viaCidade = resolveMunicipioFromCidade(item.cidade, item.uf)
    if (viaCidade) {
      const labelUnidade =
        unidadeRaw && !isUnidadeLixo(unidadeRaw)
          ? unidadeRaw
          : 'Sem unidade informada'
      addToMunMap(
        munMap,
        viaCidade.municipio,
        viaCidade.municipioIbge,
        qtd,
        labelUnidade
      )
    }
  }

  for (const row of munMap.values()) {
    row.unidades.sort((a, b) => b.totalApenados - a.totalApenados)
  }

  return [...munMap.values()].sort((a, b) => b.totalApenados - a.totalApenados)
}
