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
}

function FlyToMunicipio({
  ibge,
  geojson,
}: {
  ibge: number | null
  geojson: GeoJSON.FeatureCollection | null
}) {
  const map = useMap()
  useEffect(() => {
    if (!ibge || !geojson) return
    const feature = geojson.features.find(
      (f) => parseInt(String((f.properties as { codarea?: string })?.codarea), 10) === ibge
    )
    if (!feature?.geometry) return
    const layer = L.geoJSON(feature as GeoJSON.Feature)
    const bounds = layer.getBounds()
    if (bounds.isValid()) {
      map.flyToBounds(bounds, { padding: [48, 48], maxZoom: 10, duration: 1.2 })
    }
  }, [ibge, geojson, map])
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

function buildTooltip(stat: MunicipioMapStats | undefined, nome: string): string {
  if (!stat || stat.totalApenados <= 0) {
    return `<strong>${nome}</strong><br/><em>Sem registros</em>`
  }

  const estilo = stat.estiloMapa
  if (estilo?.tipo === 'split') {
    const pct = Math.round((estilo.ratioPredominante ?? 0.5) * 100)
    return `<strong>${nome}</strong><br/>${stat.totalApenados} faccionado(s)<br/>
      <span style="color:#dc2626">● CV: ${estilo.cvCount}</span> ·
      <span style="color:#f8fafc;background:#111;padding:0 3px;border-radius:2px">▥ PCC: ${estilo.pccCount}</span><br/>
      <em>Predominante: ${stat.faccaoPredominante} (${pct}%)</em>`
  }

  if (estilo?.tipo === 'striped') {
    return `<strong>${nome}</strong><br/>${stat.totalApenados} faccionado(s)<br/>
      <span style="color:#f8fafc;background:repeating-linear-gradient(45deg,#111,#111 2px,#fff 2px,#fff 4px);padding:0 4px;border-radius:2px">▥ PCC</span>`
  }

  if (estilo?.predominanteGrupo === 'CV') {
    return `<strong>${nome}</strong><br/>${stat.totalApenados} faccionado(s)<br/>
      <span style="color:#dc2626">● Comando Vermelho</span>`
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
}: Props) {
  const geojson = useMemo(() => (rawGeo ? enrichGeoJson(rawGeo) : null), [rawGeo])
  const geoKey = useMemo(
    () =>
      `${selectedIbge ?? ''}-${highlightIbge ?? ''}-${maxApenados}-${municipios
        .map((m) => `${m.ibge}:${m.estiloMapa?.tipo ?? ''}:${m.estiloMapa?.cvCount ?? 0}:${m.estiloMapa?.pccCount ?? 0}:${m.faccaoCor}`)
        .join('|')}`,
    [selectedIbge, highlightIbge, maxApenados, municipios]
  )

  const styleFeature = useCallback(
    (feature?: GeoJSON.Feature) => {
      const ibge = parseInt(String((feature?.properties as { ibge?: number })?.ibge), 10)
      const nome = (feature?.properties as { nome?: string })?.nome || ''
      const stat = statsByIbge[ibge] || statsByNome[nome]
      const total = stat?.totalApenados ?? 0
      const isSelected = selectedIbge === ibge
      const isHighlight = highlightIbge === ibge
      const linkBase = !!(linkMode && !isSelected)

      const fillColor = resolveMapFillColor(
        stat,
        Number.isFinite(ibge) ? ibge : null,
        total,
        maxApenados,
        linkBase
      )

      return {
        fillColor,
        fillOpacity: linkMode
          ? (isSelected ? 0.9 : total > 0 ? 0.45 : 0.28)
          : total > 0 ? (isSelected || isHighlight ? 0.9 : 0.78) : 0.12,
        color: isSelected
          ? '#0f172a'
          : linkMode
            ? '#f59e0b'
            : isHighlight
              ? '#0f172a'
              : total > 0
                ? '#1e293b'
                : '#94a3b8',
        weight: isSelected || isHighlight ? 3 : linkMode ? 1.2 : total > 0 ? 1.5 : 0.8,
        opacity: 1,
      } as L.PathOptions
    },
    [statsByIbge, statsByNome, maxApenados, selectedIbge, highlightIbge, linkMode]
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
          l.setStyle({ ...base, fillOpacity: 0.95, weight: 2.5 })
        },
        mouseout: (e) => {
          const l = e.target as L.Path
          l.setStyle(styleFeature(feature))
        },
        click: () => onSelect(ibge, nome),
      })
    },
    [statsByIbge, statsByNome, onSelect, styleFeature, linkMode]
  )

  const flyIbge = highlightIbge ?? selectedIbge

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
        <FlyToMunicipio ibge={flyIbge} geojson={geojson} />
      </MapContainer>
    </div>
  )
}