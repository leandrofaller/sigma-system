'use client'

import type { ReactNode } from 'react'
import { type FaccaoBanda, type FaccaoEstiloMapa } from '@/lib/mapa-faccoes'
import { MAPA_PCC_STRIPES_ID } from '@/lib/mapa-faccoes-patterns'
import type { MunicipioMapStats } from './MapaFaccoesMap'

/** Máximo de faixas distintas no polígono; o resto vira uma faixa "Outras" cinza. */
const MAX_FAIXAS = 4
const COR_OUTRAS = '#6b7280'

function PccStripesInRect({ x, width }: { x: number; width: number }) {
  const step = 6
  const stripes: ReactNode[] = []
  for (let i = 0; i < width; i += step) {
    stripes.push(
      <rect key={`k${x}-${i}`} x={x + i} y={0} width={step / 2} height={100} fill="#0a0a0a" />,
      <rect key={`w${x}-${i}`} x={x + i + step / 2} y={0} width={step / 2} height={100} fill="#f8fafc" />
    )
  }
  return <>{stripes}</>
}

/** Reduz as bandas a no máx. MAX_FAIXAS faixas, somando as menores em "Outras". */
function faixasDoPadrao(bandas: FaccaoBanda[]): Array<{ cor: string; striped: boolean; ratio: number }> {
  if (bandas.length <= MAX_FAIXAS) {
    return bandas.map((b) => ({ cor: b.cor, striped: b.striped, ratio: b.ratio }))
  }
  const principais = bandas.slice(0, MAX_FAIXAS - 1)
  const resto = bandas.slice(MAX_FAIXAS - 1)
  const ratioResto = resto.reduce((s, b) => s + b.ratio, 0)
  return [
    ...principais.map((b) => ({ cor: b.cor, striped: b.striped, ratio: b.ratio })),
    { cor: COR_OUTRAS, striped: false, ratio: ratioResto },
  ]
}

function SplitPatternDef({ ibge, estilo }: { ibge: number; estilo: FaccaoEstiloMapa }) {
  const faixas = faixasDoPadrao(estilo.bandas ?? [])
  const somaRatio = faixas.reduce((s, f) => s + f.ratio, 0) || 1

  // Larguras proporcionais somando 100; a última faixa recebe o resto p/ fechar sem gap.
  let x = 0
  const rects: ReactNode[] = []
  faixas.forEach((f, i) => {
    const width = i === faixas.length - 1 ? Math.max(0, 100 - x) : Math.max(1, Math.round((f.ratio / somaRatio) * 100))
    if (width <= 0) return
    rects.push(
      f.striped ? (
        <PccStripesInRect key={`f${i}`} x={x} width={width} />
      ) : (
        <rect key={`f${i}`} x={x} y={0} width={width} height={100} fill={f.cor} />
      )
    )
    x += width
  })

  return (
    <pattern id={`mapa-split-${ibge}`} width="100" height="100" patternUnits="userSpaceOnUse">
      {rects}
    </pattern>
  )
}

/** Definições SVG globais — Leaflet referencia via fillColor: url(#id). */
export function MapaFaccaoPatternDefs({ municipios }: { municipios: MunicipioMapStats[] }) {
  const splits = municipios.filter((m) => m.ibge && m.estiloMapa?.tipo === 'split')

  return (
    <svg
      width={0}
      height={0}
      style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }}
      aria-hidden
    >
      <defs>
        <pattern
          id={MAPA_PCC_STRIPES_ID}
          width="8"
          height="8"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          <rect width="8" height="8" fill="#f8fafc" />
          <rect width="4" height="8" fill="#0a0a0a" />
        </pattern>
        {splits.map((m) => (
          <SplitPatternDef key={m.ibge} ibge={m.ibge!} estilo={m.estiloMapa!} />
        ))}
      </defs>
    </svg>
  )
}