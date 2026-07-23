'use client'

import { useMemo, useCallback, useEffect } from 'react'
import { MapContainer, TileLayer, GeoJSON, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { IBGE_PARA_NOME, CENTRO_RONDONIA, ZOOM_ESTADO } from '@/lib/municipios-rondonia'
import { type FaccaoEstiloMapa } from '@/lib/mapa-faccoes'
import { resolveMapFillColor } from '@/lib/mapa-faccoes-patterns'
import { MapaFaccaoPatternDefs } from './MapaFaccaoPatternDefs'

delete (L.Icon.Default.prototype as any)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

export interface MunicipioMapStats {
  ibge: number | null
  nome: string
  totalApenados: number
  faccaoPredominante: string
  faccaoCor: string
  faccaoSecundaria?: string
  estiloMapa?: FaccaoEstiloMapa
  faccoes?: Record<string, number>
}

interface Props {
  geojson: GeoJSON.FeatureCollection | null
  municipios: MunicipioMapStats[]
  statsByIbge: Record<number, MunicipioMapStats>
  statsByNome: Record<string, MunicipioMapStats>
  maxApenados: number
  selectedIbge: number | null
  highlightIbge: number | null
  onSelect: (ibge: number, nome: string) => void
  presentationMode?: boolean
  linkMode?: boolean
  /** Quando true, municípios sem total ficam quase invisíveis (filtro "só com atuação"). */
  hideEmpty?: boolean
  /** Facção filtrada — reforça contraste nos que têm atuação. */
  filtroAtivo?: boolean
}

function FlyToMunicipio({
  ibge,
  geojson,
  hasFocus,
}: {
  ibge: number | null
  geojson: GeoJSON.FeatureCollection | null
  hasFocus: boolean
}) {
  const map = useMap()
  useEffect(() => {
    if (!geojson) return

    if (!hasFocus || !ibge) {
      map.flyTo(CENTRO_RONDONIA, ZOOM_ESTADO, { duration: 1.1 })
      return
    }

    const feature = geojson.features.find(
      (f) => parseInt(String((f.properties as { codarea?: string })?.codarea), 10) === ibge
    )
    if (!feature?.geometry) return
    const layer = L.geoJSON(feature as GeoJSON.Feature)
    const bounds = layer.getBounds()
    if (bounds.isValid()) {
      // Padding generoso embaixo para o spotlight panel não cobrir o município
      map.flyToBounds(bounds, {
        paddingTopLeft: [40, 40],
        paddingBottomRight: [40, 220],
        maxZoom: 10,
        duration: 1.15,
      })
    }
  }, [ibge, geojson, map, hasFocus])
  return null
}

function enrichGeoJson(raw: GeoJSON.FeatureCollection): GeoJSON.FeatureCollection {
  return {
    ...raw,
    features: raw.features.map((f) => {
      const codarea = parseInt(String((f.properties as { codarea?: string })?.codarea), 10)
      const nome = IBGE_PARA_NOME[codarea] || `IBGE ${codarea}`
      return {
        ...f,
        properties: { ...f.properties, codarea, nome, ibge: codarea },
      }
    }),
  }
}

const STRIPE_SWATCH =
  '<span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:repeating-linear-gradient(45deg,#0a0a0a,#0a0a0a 2px,#f8fafc 2px,#f8fafc 4px);border:1px solid rgba(255,255,255,.3);vertical-align:middle"></span>'

function dotSwatch(cor: string): string {
  return `<span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${cor};border:1px solid rgba(255,255,255,.25);vertical-align:middle"></span>`
}

function buildTooltip(stat: MunicipioMapStats | undefined, nome: string): string {
  if (!stat || stat.totalApenados <= 0) {
    return `<strong>${nome}</strong><br/><em>Sem registros</em>`
  }

  const estilo = stat.estiloMapa
  const bandas = estilo?.bandas ?? []

  if (bandas.length > 0) {
    const linhas = bandas
      .map((b) => {
        const swatch = b.striped ? STRIPE_SWATCH : dotSwatch(b.cor)
        const cor = b.striped ? '#f8fafc' : b.cor
        return `<span style="white-space:nowrap"><span style="margin-right:4px">${swatch}</span><span style="color:${cor}">${b.label}: ${b.count}</span></span>`
      })
      .join(' · ')
    const pct = Math.round((estilo?.ratioPredominante ?? 0) * 100)
    const predLine =
      bandas.length > 1
        ? `<br/><em>Predominante: ${estilo?.predominanteLabel} (${pct}%)</em>`
        : ''
    return `<strong>${nome}</strong><br/>${stat.totalApenados} faccionado(s)<br/>${linhas}${predLine}`
  }

  return `<strong>${nome}</strong><br/>${stat.totalApenados} faccionado(s)<br/>
    <span style="color:${stat.faccaoCor}">● ${stat.faccaoPredominante}</span>`
}

export default function MapaFaccoesMap({
  geojson: rawGeo,
  municipios,
  statsByIbge,
  statsByNome,
  maxApenados,
  selectedIbge,
  highlightIbge,
  onSelect,
  presentationMode,
  linkMode,
  hideEmpty = false,
  filtroAtivo = false,
}: Props) {
  const geojson = useMemo(() => (rawGeo ? enrichGeoJson(rawGeo) : null), [rawGeo])
  const focusIbge = highlightIbge ?? selectedIbge
  const hasFocus = focusIbge != null

  const geoKey = useMemo(
    () =>
      `${selectedIbge ?? ''}-${highlightIbge ?? ''}-${maxApenados}-${hideEmpty ? 1 : 0}-${filtroAtivo ? 1 : 0}-${municipios
        .map((m) => {
          const bandas = (m.estiloMapa?.bandas ?? [])
            .map((b) => `${b.label}:${b.count}`)
            .join(',')
          return `${m.ibge}:${m.estiloMapa?.tipo ?? ''}:${m.faccaoCor}:${m.totalApenados}:${bandas}`
        })
        .join('|')}`,
    [selectedIbge, highlightIbge, maxApenados, hideEmpty, filtroAtivo, municipios]
  )

  const styleFeature = useCallback(
    (feature?: GeoJSON.Feature) => {
      const ibge = parseInt(String((feature?.properties as { ibge?: number })?.ibge), 10)
      const nome = (feature?.properties as { nome?: string })?.nome || ''
      const stat = statsByIbge[ibge] || statsByNome[nome]
      const total = stat?.totalApenados ?? 0
      const isSelected = selectedIbge === ibge
      const isHighlight = highlightIbge === ibge
      const isFocused = isSelected || isHighlight
      const linkBase = !!(linkMode && !isSelected)
      const empty = total <= 0
      const dimOthers = hasFocus && !isFocused

      // Malha sempre legível: contorno claro no basemap escuro
      let stroke = empty ? '#64748b' : '#e2e8f0'
      let weight = empty ? 1 : 1.75
      let fillOpacity = empty ? 0.08 : filtroAtivo ? 0.88 : 0.8
      let dashArray: string | undefined

      if (linkMode) {
        stroke = isSelected ? '#fbbf24' : '#f59e0b'
        weight = isSelected ? 3.5 : 1.4
        fillOpacity = isSelected ? 0.92 : total > 0 ? 0.48 : 0.28
      } else if (isFocused) {
        stroke = isHighlight && !isSelected ? '#38bdf8' : '#fbbf24'
        weight = 4.5
        fillOpacity = 0.95
      } else if (dimOthers) {
        // Dimming forte: o município em foco "salta" na apresentação
        stroke = '#475569'
        weight = 0.9
        fillOpacity = empty ? 0.04 : 0.14
      } else if (hideEmpty && empty) {
        fillOpacity = 0.03
        stroke = '#334155'
        weight = 0.7
      } else if (filtroAtivo && empty) {
        fillOpacity = 0.05
        stroke = '#475569'
        weight = 1
        dashArray = '3 4'
      }

      const fillColor =
        empty && (hideEmpty || filtroAtivo)
          ? '#0f172a'
          : resolveMapFillColor(
              stat,
              Number.isFinite(ibge) ? ibge : null,
              total,
              maxApenados,
              linkBase
            )

      return {
        fillColor,
        fillOpacity,
        color: stroke,
        weight,
        opacity: 1,
        dashArray,
        className: isFocused ? 'mapa-mun-focused' : empty ? 'mapa-mun-empty' : 'mapa-mun',
      } as L.PathOptions
    },
    [
      statsByIbge,
      statsByNome,
      maxApenados,
      selectedIbge,
      highlightIbge,
      linkMode,
      hasFocus,
      hideEmpty,
      filtroAtivo,
    ]
  )

  const onEachFeature = useCallback(
    (feature: GeoJSON.Feature, layer: L.Layer) => {
      const ibge = parseInt(String((feature.properties as { ibge?: number })?.ibge), 10)
      const nome = (feature.properties as { nome?: string })?.nome || IBGE_PARA_NOME[ibge] || ''
      const stat = statsByIbge[ibge] || statsByNome[nome]

      layer.unbindTooltip()
      if (linkMode) {
        layer.bindTooltip(
          `<strong>${nome}</strong><br/><span style="color:#f59e0b">● Clique para vincular aqui</span>`,
          { sticky: true, className: 'mapa-faccao-tooltip' }
        )
      } else {
        layer.bindTooltip(buildTooltip(stat, nome), { sticky: true, className: 'mapa-faccao-tooltip' })
      }

      layer.on({
        mouseover: (e) => {
          const l = e.target as L.Path
          const base = styleFeature(feature)
          const isFocused =
            selectedIbge === ibge || highlightIbge === ibge
          if (isFocused) {
            l.setStyle({ ...base, weight: 5, fillOpacity: 0.98 })
          } else {
            l.setStyle({
              ...base,
              fillOpacity: Math.min(0.95, (base.fillOpacity ?? 0.7) + 0.2),
              weight: Math.max(2.5, (base.weight ?? 1.5) + 1),
              color: '#f8fafc',
            })
            l.bringToFront()
          }
        },
        mouseout: (e) => {
          const l = e.target as L.Path
          l.setStyle(styleFeature(feature))
          // Mantém o focado na frente
          if (selectedIbge === ibge || highlightIbge === ibge) l.bringToFront()
        },
        click: () => onSelect(ibge, nome),
      })
    },
    [statsByIbge, statsByNome, onSelect, styleFeature, linkMode, selectedIbge, highlightIbge]
  )

  return (
    <div className="relative h-full w-full">
      <MapaFaccaoPatternDefs municipios={municipios} />
      <MapContainer
        center={CENTRO_RONDONIA}
        zoom={ZOOM_ESTADO}
        className="h-full w-full rounded-2xl z-0"
        scrollWheelZoom
        zoomControl={!presentationMode}
        attributionControl={!presentationMode}
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; CARTO'
        />
        {geojson && (
          <GeoJSON
            key={geoKey}
            data={geojson}
            style={styleFeature}
            onEachFeature={onEachFeature}
          />
        )}
        <FlyToMunicipio ibge={focusIbge} geojson={geojson} hasFocus={hasFocus} />
      </MapContainer>
    </div>
  )
}
