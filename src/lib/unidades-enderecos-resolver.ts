import { normalizeSearch } from '@/lib/search'
import { normalizeMunicipioNome, nomeParaIbge } from '@/lib/municipios-rondonia'
import { UNIDADES_ENDERECOS_RO, type UnidadeEndereco } from '@/lib/unidades-enderecos-ro'

/** Comarca da lista oficial → município IBGE no mapa de RO. */
const COMARCA_PARA_MUNICIPIO: Record<string, string> = {
  'PORTO VELHO': 'Porto Velho',
  'GUAJARÁ-MIRIM': 'Guajará-Mirim',
  'ARIQUEMES': 'Ariquemes',
  'BURITIS': 'Buritis',
  'MACHADINHO DO OESTE': "Machadinho D'Oeste",
  'JARU': 'Jaru',
  'OURO PRETO': 'Ouro Preto do Oeste',
  'JI-PARANÁ': 'Ji-Paraná',
  'PRESIDENTE MÉDICI': 'Presidente Médici',
  "ALVORADA D'OESTE": "Alvorada D'Oeste",
  'SÃO MIGUEL DO GUAPORÉ': 'São Miguel do Guaporé',
  'SÃO FRANCISCO DO GUAPORÉ': 'São Francisco do Guaporé',
  'COSTA MARQUES': 'Costa Marques',
  'CACOAL': 'Cacoal',
  'ROLIM DE MOURA': 'Rolim de Moura',
  'PIMENTA BUENO': 'Pimenta Bueno',
  'ALTA FLORESTA': "Alta Floresta D'Oeste",
  'VILHENA': 'Vilhena',
  'COLORADO DO OESTE': 'Colorado do Oeste',
  'CEREJEIRAS': 'Cerejeiras',
}

/** Unidades cuja sede física fica em município diferente da comarca. */
const MUNICIPIO_OVERRIDE_BY_ID: Record<string, string> = {
  'gm-nova-mamore': 'Nova Mamoré',
}

/** Siglas e nomes usados no SIPE/AIP → id da unidade na lista oficial. */
const ALIAS_PARA_ID: Record<string, string> = {
  PANDA: 'pv-panda',
  CDPPVH: 'pv-urso',
  URSO: 'pv-urso',
  CAPEP: 'pv-capep',
  'CAPEP I': 'pv-capep',
  PEA: 'pv-aruana',
  ARUANA: 'pv-aruana',
  CRVG: 'pv-crvg',
  UMESP: 'pv-umesp',
  USAFAM: 'pv-usafam',
  UPES: 'pv-medidas-seguranca',
  'SEGURANCA ESPECIAL': 'pv-medidas-seguranca',
  'MEDIDA DE SEGURANCA': 'pv-medidas-seguranca',
  'MEDIDAS DE SEGURANCA': 'pv-medidas-seguranca',
  ENIO: 'pv-enio',
  'ANTIGO ENIO': 'pv-enio',
  PENFEN: 'pv-suely',
  PEPFEM: 'pv-suely',
  SUELY: 'pv-suely',
  'JORGE THIAGO': 'pv-jorge-thiago',
  'EDIVAN MARIANO': 'pv-panda',
  'EDVAN MARIANO': 'pv-panda',
  'MILTON SOARES': 'pv-milton',
  '470': 'pv-milton',
  'NOVA MAMORE': 'gm-nova-mamore',
  'AGENOR MARTINS': 'jip-penitenciaria',
  'JONAS FERRETI': 'buritis-cr',
  'AUGUSTO S KEMPE': 'jaru-crr',
  'AUGUSTO S. KEMPE': 'jaru-crr',
  'AUGUSTO SIMON KEMPE': 'jaru-crr',
  'AUGUSTO SIMON': 'jaru-crr',
  KEMPE: 'jaru-crr',
  'CONE SUL': 'vilhena-cone-sul',
  'YOHAN FLAVIO': 'alvorada-cr',
  CRA: 'ariq-cr',
  // GME: só com GERENCIA/GME isolado — não usar "MONITORAMENTO ELETRONICO" genérico
  // (há unidades de monitoramento em Ji-Paraná, Rolim, etc.)
  'GERENCIA DE MONITORACAO': 'pv-umesp',
  'GERENCIA DE MONITORAMENTO': 'pv-umesp',
  'GME': 'pv-umesp',
  'FEMININA E SEMIABERTO DE VILHENA': 'vilhena-colonia',
  'PRESIDIO FEMININO DE VILHENA': 'vilhena-colonia',
  'COLONIA PENAL DE VILHENA': 'vilhena-colonia',
}

const UNIDADE_POR_ID = Object.fromEntries(UNIDADES_ENDERECOS_RO.map((u) => [u.id, u]))

function normKey(value: string): string {
  return normalizeSearch(value).replace(/[^A-Z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()
}

function extrairAliasesParenteses(unidade: string): string[] {
  const matches = unidade.match(/\(([^)]+)\)/g) ?? []
  return matches
    .map((m) => m.replace(/[()]/g, '').trim())
    .filter(Boolean)
    .flatMap((inner) => inner.split(/\be\b|\/|,/i).map((s) => s.trim()).filter(Boolean))
}

export function municipioMapaFromUnidadeEndereco(entry: UnidadeEndereco): string | null {
  return municipioFromCatalogEntry(entry)
}

export function municipioIbgeFromUnidadeEndereco(entry: UnidadeEndereco): number | null {
  const m = municipioFromCatalogEntry(entry)
  return m ? nomeParaIbge(m) : null
}

export function geoMapaFromUnidadeEndereco(entry: UnidadeEndereco) {
  const municipio = municipioFromCatalogEntry(entry)
  return {
    comarca: entry.comarca,
    municipio,
    municipioIbge: municipio ? nomeParaIbge(municipio) : null,
  }
}

/** URL do Mapa Facções com município pré-selecionado. */
export function mapaFaccoesHref(municipio: string | null, ibge: number | null): string {
  if (!municipio) return '/mapa-faccoes'
  const p = new URLSearchParams({ municipio })
  if (ibge) p.set('ibge', String(ibge))
  return `/mapa-faccoes?${p}`
}

export function listaEnderecosHref(unidadeId: string): string {
  return `/lista-enderecos?unidade=${encodeURIComponent(unidadeId)}`
}

/** Link para lista de endereços a partir do nome/sigla de unidade do AIP/SIPE. */
export function listaEnderecosHrefFromUnidadeAip(unidadeAip: string | null | undefined): string | null {
  const entry = resolveUnidadeEndereco(unidadeAip)
  return entry ? listaEnderecosHref(entry.id) : null
}

/** Unidade AIP/SIPE corresponde à entrada da lista oficial? */
export function unidadeCorrespondeCatalogo(
  unidadeAip: string | null | undefined,
  entry: UnidadeEndereco,
  extraCatalog: UnidadeEndereco[] = []
): boolean {
  const r = resolveUnidadeEndereco(unidadeAip, extraCatalog)
  if (r) return r.id === entry.id
  if (!unidadeAip?.trim()) return false
  return normKey(unidadeAip) === normKey(entry.unidade)
}

function municipioFromCatalogEntry(entry: UnidadeEndereco): string | null {
  const override = MUNICIPIO_OVERRIDE_BY_ID[entry.id]
  if (override) {
    const m = normalizeMunicipioNome(override)
    return nomeParaIbge(m) ? m : null
  }

  const fromComarca = COMARCA_PARA_MUNICIPIO[entry.comarca]
  if (fromComarca) {
    const m = normalizeMunicipioNome(fromComarca)
    return nomeParaIbge(m) ? m : null
  }

  const m = normalizeMunicipioNome(entry.comarca)
  return nomeParaIbge(m) ? m : null
}

/**
 * Resolve texto de unidade do AIP/SIPE para entrada da lista oficial de endereços.
 */
function resolveInCatalog(unidadeAip: string, catalog: UnidadeEndereco[]): UnidadeEndereco | null {
  const norm = normKey(unidadeAip)

  for (const entry of catalog) {
    if (normKey(entry.unidade) === norm) return entry
  }

  for (const entry of catalog) {
    for (const alias of extrairAliasesParenteses(entry.unidade)) {
      const aliasNorm = normKey(alias)
      if (aliasNorm.length >= 3 && norm.includes(aliasNorm)) return entry
    }
  }

  let best: { entry: UnidadeEndereco; score: number } | null = null
  for (const entry of catalog) {
    const cat = normKey(entry.unidade)
    if (!cat || cat.length < 8) continue

    if (norm.includes(cat) || cat.includes(norm)) {
      const score = Math.min(norm.length, cat.length) / Math.max(norm.length, cat.length)
      if (!best || score > best.score) best = { entry, score }
    }

    const comarcaNorm = normKey(entry.comarca)
    if (comarcaNorm.length >= 4 && norm.includes(comarcaNorm)) {
      const tokens = cat.split(' ').filter((t) => t.length >= 5)
      const matched = tokens.filter((t) => norm.includes(t)).length
      if (matched >= 2) {
        const score = 0.55 + matched * 0.08
        if (!best || score > best.score) best = { entry, score }
      }
    }
  }

  return best && best.score >= 0.45 ? best.entry : null
}

export function resolveUnidadeEndereco(
  unidadeAip: string | null | undefined,
  extraCatalog: UnidadeEndereco[] = []
): UnidadeEndereco | null {
  if (!unidadeAip?.trim()) return null
  const norm = normKey(unidadeAip)

  const extraHit = resolveInCatalog(unidadeAip, extraCatalog)
  if (extraHit) return extraHit

  for (const entry of UNIDADES_ENDERECOS_RO) {
    if (normKey(entry.unidade) === norm) return entry
  }

  // Aliases curtos (≤4) só batem como token isolado (evita "GME" dentro de outras palavras
  // e "CRA" acidental). Aliases longos usam includes.
  for (const [alias, id] of Object.entries(ALIAS_PARA_ID)) {
    const aliasNorm = normKey(alias)
    if (aliasNorm.length < 3) continue
    const hit = UNIDADE_POR_ID[id]
    if (!hit) continue
    if (aliasNorm.length <= 4) {
      const tokenRe = new RegExp(`(?:^|\\s)${aliasNorm}(?:\\s|$)`)
      if (tokenRe.test(norm)) return hit
    } else if (norm.includes(aliasNorm) || norm.startsWith(aliasNorm)) {
      return hit
    }
  }

  for (const entry of UNIDADES_ENDERECOS_RO) {
    for (const alias of extrairAliasesParenteses(entry.unidade)) {
      const aliasNorm = normKey(alias)
      if (aliasNorm.length >= 3 && norm.includes(aliasNorm)) return entry
    }
  }

  let best: { entry: UnidadeEndereco; score: number } | null = null

  for (const entry of UNIDADES_ENDERECOS_RO) {
    const cat = normKey(entry.unidade)
    if (!cat || cat.length < 8) continue

    if (norm.includes(cat) || cat.includes(norm)) {
      const score = Math.min(norm.length, cat.length) / Math.max(norm.length, cat.length)
      if (!best || score > best.score) best = { entry, score }
    }

    const comarcaNorm = normKey(entry.comarca)
    if (comarcaNorm.length >= 4 && norm.includes(comarcaNorm)) {
      const tokens = cat.split(' ').filter((t) => t.length >= 5)
      const matched = tokens.filter((t) => norm.includes(t)).length
      if (matched >= 2) {
        const score = 0.55 + matched * 0.08
        if (!best || score > best.score) best = { entry, score }
      }
    }
  }

  return best && best.score >= 0.45 ? best.entry : null
}

/**
 * Infere município IBGE a partir da unidade prisional cadastrada no AIP,
 * usando a lista oficial de endereços.
 */
export function inferMunicipioFromUnidadeAip(unidadeAip: string | null | undefined): string | null {
  const entry = resolveUnidadeEndereco(unidadeAip)
  if (!entry) return null
  return municipioFromCatalogEntry(entry)
}

export interface MunicipioMapaInferido {
  municipio: string
  via: 'unidade' | 'cidade' | 'naturalidade'
  unidadeCatalogo?: UnidadeEndereco
}

type AipGeoSource = {
  cidade?: string | null
  uf?: string | null
  naturalidade?: string | null
  unidade?: string | null
}

/** Infere município por cidade/naturalidade (lógica legada). */
export function inferMunicipioFromCidadeNaturalidade(ap: AipGeoSource): string | null {
  const uf = (ap.uf || '').trim().toUpperCase()
  if (ap.cidade?.trim() && (!uf || uf === 'RO')) {
    const m = normalizeMunicipioNome(ap.cidade)
    if (nomeParaIbge(m)) return m
  }

  if (ap.naturalidade?.trim()) {
    const parts = ap.naturalidade.split(/[-–—/,;|]/).map((s) => s.trim()).filter(Boolean)
    for (const part of parts) {
      const clean = part.replace(/\bRO\b/gi, '').trim()
      if (!clean) continue
      const m = normalizeMunicipioNome(clean)
      if (nomeParaIbge(m)) return m
    }
  }

  return null
}

/**
 * Melhor esforço para município no mapa: unidade prisional (lista oficial) → cidade → naturalidade.
 */
export function inferMunicipioForMapa(ap: AipGeoSource): MunicipioMapaInferido | null {
  if (ap.unidade?.trim()) {
    const entry = resolveUnidadeEndereco(ap.unidade)
    if (entry) {
      const municipio = municipioFromCatalogEntry(entry)
      if (municipio) return { municipio, via: 'unidade', unidadeCatalogo: entry }
    }
  }

  const fromCidade = inferMunicipioFromCidadeNaturalidade(ap)
  if (fromCidade) {
    const via = ap.cidade?.trim() && nomeParaIbge(normalizeMunicipioNome(ap.cidade)) ? 'cidade' : 'naturalidade'
    return { municipio: fromCidade, via }
  }

  return null
}

/** Verifica se unidade AIP corresponde à lista oficial (útil para diagnóstico). */
export function unidadeReconhecidaNaLista(unidadeAip: string | null | undefined): boolean {
  return resolveUnidadeEndereco(unidadeAip) != null
}