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
 * apenas com unidade prisional identificada no catálogo.
 */
export interface ApenadosMunicipioUnidadesPrisionais {
  municipio: string
  municipioIbge: number | null
  /** Soma de presos com unidade reconhecida no município. */
  totalApenados: number
  /** Detalhamento por unidade identificada. */
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
  if (
    key.includes('FEDERAL') &&
    (key.includes('CAMPO GRANDE') || key.includes('BRASILIA') || key.includes('CATANDUVAS'))
  ) {
    return true
  }
  return false
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
 * Total de presos por município — somente com unidade prisional identificada.
 *
 * - Exige `unidade` preenchida e resolvida no catálogo de endereços
 * - Não usa fallback por cidade / "Sem unidade informada"
 * - Mesmo filtro `sexo not null` do dashboard da aba Unidades Prisionais
 */
export async function buildApenadosUnidadesPrisionaisPorMunicipio(): Promise<
  ApenadosMunicipioUnidadesPrisionais[]
> {
  const [statsUnidade, customCatalog] = await Promise.all([
    prisma.sipeApenadoUnidadePrisional.groupBy({
      by: ['unidade'],
      where: {
        sexo: { not: null },
        unidade: { not: null },
      },
      _count: { id: true },
    }),
    loadCustomUnidadesAtivas(),
  ])

  const munMap = new Map<string, ApenadosMunicipioUnidadesPrisionais>()

  for (const item of statsUnidade) {
    const unidadeRaw = item.unidade?.trim()
    if (!unidadeRaw || isUnidadeLixo(unidadeRaw)) continue

    const entry = resolveUnidadeEndereco(unidadeRaw, customCatalog)
    if (!entry) continue

    const geo = geoMapaFromUnidadeEndereco(entry)
    if (!geo.municipio) continue

    const municipio = normalizeMunicipioNome(geo.municipio)
    const municipioIbge = geo.municipioIbge ?? nomeParaIbge(municipio)
    addToMunMap(
      munMap,
      municipio,
      municipioIbge,
      item._count.id,
      entry.unidade || unidadeRaw
    )
  }

  for (const row of munMap.values()) {
    row.unidades.sort((a, b) => b.totalApenados - a.totalApenados)
  }

  return [...munMap.values()].sort((a, b) => b.totalApenados - a.totalApenados)
}
