'use client'

import type { ReactNode } from 'react'
import { COR_CV, type FaccaoEstiloMapa } from '@/lib/mapa-faccoes'
import { MAPA_PCC_STRIPES_ID } from '@/lib/mapa-faccoes-patterns'
import type { MunicipioMapStats } from './MapaFaccoesMap'

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

function SplitPatternDef({ ibge, estilo }: { ibge: number; estilo: FaccaoEstiloMapa }) {
  const pct = Math.round(Math.min(92, Math.max(8, (estilo.ratioPredominante ?? 0.5) * 100)))
  const rest = 100 - pct
  const predIsCv = estilo.predominanteGrupo === 'CV'

  return (
    <pattern
      id={`mapa-split-${ibge}`}
      width="100"
      height="100"
      patternUnits="userSpaceOnUse"
    >
      {predIsCv ? (
        <>
          <rect width={pct} height="100" fill={COR_CV} />
          <PccStripesInRect x={pct} width={rest} />
        </>
      ) : (
        <>
          <PccStripesInRect x={0} width={pct} />
          <rect x={pct} width={rest} height="100" fill={COR_CV} />
        </>
      )}
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