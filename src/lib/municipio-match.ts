import { normalizeMunicipioNome } from '@/lib/municipios-rondonia'
import { normalizeSearch } from '@/lib/search'

/** Compara município do vínculo/mapa com filtro (IBGE ou nome canônico). */
export function matchesMunicipio(
  armazenado: { municipio: string; municipioIbge?: number | null },
  queryNome: string,
  queryIbge?: number | null
): boolean {
  if (queryIbge != null && armazenado.municipioIbge === queryIbge) return true

  const qNome = normalizeSearch(queryNome)
  if (!qNome) return true

  const vNome = normalizeSearch(armazenado.municipio)
  if (vNome === qNome) return true

  const canonQuery = normalizeSearch(normalizeMunicipioNome(queryNome))
  const canonV = normalizeSearch(normalizeMunicipioNome(armazenado.municipio))
  return canonV === canonQuery || vNome.includes(qNome) || qNome.includes(vNome)
}

export function municipioCanonico(nome: string): string {
  return normalizeMunicipioNome(nome)
}