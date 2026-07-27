import { normalizeSearch } from '@/lib/search'

export const UNIDADE_LIXO = new Set(
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

export function isUnidadeLixo(unidade: string | null | undefined): boolean {
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
