import { intensidadeCor, type FaccaoEstiloMapa } from '@/lib/mapa-faccoes'

export const MAPA_PCC_STRIPES_ID = 'mapa-pcc-stripes'

/** Padrão listrado PCC (mapa e ícones de legenda — nunca como fundo de texto). */
export const PCC_STRIPE_GRADIENT =
  'repeating-linear-gradient(45deg,#0a0a0a,#0a0a0a 2px,#f8fafc 2px,#f8fafc 4px)'

export function splitPatternId(ibge: number): string {
  return `mapa-split-${ibge}`
}

/** Cor de preenchimento do polígono Leaflet (suporta url(#pattern) no mesmo documento HTML). */
export function resolveMapFillColor(
  stat: { faccaoCor?: string; estiloMapa?: FaccaoEstiloMapa; totalApenados?: number } | undefined,
  ibge: number | null,
  total: number,
  maxApenados: number,
  linkBase: boolean
): string {
  if (linkBase) return '#fbbf24'
  if (total <= 0) return intensidadeCor(0, maxApenados)

  const estilo = stat?.estiloMapa
  if (!estilo) return stat?.faccaoCor ?? intensidadeCor(total, maxApenados)

  if (estilo.tipo === 'striped') {
    return `url(#${MAPA_PCC_STRIPES_ID})`
  }

  if (estilo.tipo === 'split' && ibge != null) {
    return `url(#${splitPatternId(ibge)})`
  }

  return stat?.faccaoCor ?? intensidadeCor(total, maxApenados)
}