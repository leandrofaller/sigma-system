import { normalizeSearch } from '@/lib/search'
import { IBGE_PARA_NOME } from '@/lib/ibge-rondonia.generated'

export { IBGE_PARA_NOME }

/** 52 municípios de Rondônia (lista canônica para UI e validação). */
export const MUNICIPIOS_RONDONIA = [
  "Alta Floresta D'Oeste", 'Alto Alegre dos Parecis', 'Alto Paraíso',
  "Alvorada D'Oeste", 'Ariquemes', 'Buritis', 'Cabixi', 'Cacaulândia',
  'Cacoal', 'Campo Novo de Rondônia', 'Candeias do Jamari', 'Castanheiras',
  'Cerejeiras', 'Chupinguaia', 'Colorado do Oeste', 'Corumbiara',
  'Costa Marques', 'Cujubim', "Espigão D'Oeste", 'Governador Jorge Teixeira',
  'Guajará-Mirim', 'Itapuã do Oeste', 'Jaru', 'Ji-Paraná',
  "Machadinho D'Oeste", 'Ministro Andreazza', 'Mirante da Serra', 'Monte Negro',
  "Nova Brasilândia D'Oeste", 'Nova Mamoré', 'Nova União', 'Novo Horizonte do Oeste',
  'Ouro Preto do Oeste', 'Parecis', 'Pimenta Bueno', 'Pimenteiras do Oeste',
  'Porto Velho', 'Presidente Médici', 'Primavera de Rondônia', 'Rio Crespo',
  'Rolim de Moura', "Santa Luzia D'Oeste", "São Felipe D'Oeste",
  'São Francisco do Guaporé', 'São Miguel do Guaporé', 'Seringueiras',
  'Teixeirópolis', 'Theobroma', 'Urupá', 'Vale do Anari', 'Vale do Paraíso',
  'Vilhena',
] as const

export type MunicipioRondonia = (typeof MUNICIPIOS_RONDONIA)[number]

/**
 * Chave de comparação de município: ignora hífen, apóstrofo e pontuação.
 * Ex.: "Ji Paraná" = "Ji-Paraná"; "Espigão D`Oeste" = "Espigão D'Oeste".
 * Necessário porque o SIPE/Unidades Prisionais grava nomes sem a grafia canônica.
 */
export function normalizeMunicipioKey(nome: string): string {
  let key = normalizeSearch(nome)
    .replace(/[^A-Z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  // SIPE grava "Espigão DOeste" / "Machadinho DOeste" sem apóstrofo nem espaço
  key = key.replace(/([A-Z])DOESTE\b/g, '$1 D OESTE')
  key = key.replace(/\bD\s*OESTE\b/g, 'D OESTE')
  return key.replace(/\s+/g, ' ').trim()
}

const NOME_PARA_IBGE = Object.fromEntries(
  Object.entries(IBGE_PARA_NOME).map(([ibge, nome]) => [normalizeMunicipioKey(nome), Number(ibge)])
) as Record<string, number>

const NOME_CANONICO_POR_KEY = Object.fromEntries(
  MUNICIPIOS_RONDONIA.map((m) => [normalizeMunicipioKey(m), m])
) as Record<string, string>

export function normalizeMunicipioNome(nome: string): string {
  const key = normalizeMunicipioKey(nome)
  if (!key) return nome.trim()
  return NOME_CANONICO_POR_KEY[key] ?? nome.trim()
}

export function ibgeParaNome(ibge: number | string | null | undefined): string | null {
  if (ibge == null) return null
  const n = typeof ibge === 'string' ? parseInt(ibge, 10) : ibge
  return IBGE_PARA_NOME[n] ?? null
}

export function nomeParaIbge(nome: string): number | null {
  const key = normalizeMunicipioKey(nome)
  return key ? NOME_PARA_IBGE[key] ?? null : null
}

export const CENTRO_RONDONIA: [number, number] = [-10.83, -63.34]
export const ZOOM_ESTADO = 7