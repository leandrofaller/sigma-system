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

const NOME_PARA_IBGE = Object.fromEntries(
  Object.entries(IBGE_PARA_NOME).map(([ibge, nome]) => [normalizeSearch(nome), Number(ibge)])
) as Record<string, number>

export function normalizeMunicipioNome(nome: string): string {
  const key = normalizeSearch(nome)
  for (const m of MUNICIPIOS_RONDONIA) {
    if (normalizeSearch(m) === key) return m
  }
  return nome.trim()
}

export function ibgeParaNome(ibge: number | string | null | undefined): string | null {
  if (ibge == null) return null
  const n = typeof ibge === 'string' ? parseInt(ibge, 10) : ibge
  return IBGE_PARA_NOME[n] ?? null
}

export function nomeParaIbge(nome: string): number | null {
  return NOME_PARA_IBGE[normalizeSearch(nome)] ?? null
}

export const CENTRO_RONDONIA: [number, number] = [-10.83, -63.34]
export const ZOOM_ESTADO = 7