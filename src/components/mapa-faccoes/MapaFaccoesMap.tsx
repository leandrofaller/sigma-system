'use client'

import { useEffect, useMemo, useCallback } from 'react'
import { MapContainer, TileLayer, GeoJSON, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { IBGE_PARA_NOME, CENTRO_RONDONIA, ZOOM_ESTADO } from '@/lib/municipios-rondonia'
import { faccaoCor, intensidadeCor } from '@/lib/mapa-faccoes'

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
}

interface Props {
  geojson: GeoJSON.FeatureCollection | null
  statsByIbge: Record<number, MunicipioMapStats>
  statsByNome: Record<string, MunicipioMapStats>
  maxApenados: number
  selectedIbge: number | null
  highlightIbge: number | null
  onSelect: (ibge: number, nome: string) => void
  presentationMode?: boolean
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

export default function MapaFaccoesMap({
  geojson: rawGeo,
  statsByIbge,
  statsByNome,
  maxApenados,
  selectedIbge,
  highlightIbge,
  onSelect,
  presentationMode,
}: Props) {
  const geojson = useMemo(() => (rawGeo ? enrichGeoJson(rawGeo) : null), [rawGeo])
  const geoKey = useMemo(
    () => `${selectedIbge ?? ''}-${highlightIbge ?? ''}-${maxApenados}-${Object.keys(statsByIbge).join(',')}`,
    [selectedIbge, highlightIbge, maxApenados, statsByIbge]
  )

  const styleFeature = useCallback(
    (feature?: GeoJSON.Feature) => {
      const ibge = parseInt(String((feature?.properties as { ibge?: number })?.ibge), 10)
      const nome = (feature?.properties as { nome?: string })?.nome || ''
      const stat = statsByIbge[ibge] || statsByNome[nome]
      const total = stat?.totalApenados ?? 0
      const isSelected = selectedIbge === ibge
      const isHighlight = highlightIbge === ibge

      let fill = intensidadeCor(total, maxApenados)
      if (stat?.faccaoCor && total > 0) {
        fill = stat.faccaoCor
      }

      return {
        fillColor: fill,
        fillOpacity: total > 0 ? (isSelected || isHighlight ? 0.82 : 0.58) : 0.12,
        color: isSelected || isHighlight ? '#0f172a' : total > 0 ? '#1e293b' : '#94a3b8',
        weight: isSelected || isHighlight ? 3 : total > 0 ? 1.5 : 0.8,
        opacity: 1,
      } as L.PathOptions
    },
    [statsByIbge, statsByNome, maxApenados, selectedIbge, highlightIbge]
  )

  const onEachFeature = useCallback(
    (feature: GeoJSON.Feature, layer: L.Layer) => {
      const ibge = parseInt(String((feature.properties as { ibge?: number })?.ibge), 10)
      const nome = (feature.properties as { nome?: string })?.nome || IBGE_PARA_NOME[ibge] || ''
      const stat = statsByIbge[ibge]

      const tooltip = stat && stat.totalApenados > 0
        ? `<strong>${nome}</strong><br/>${stat.totalApenados} faccionado(s)<br/><span style="color:${stat.faccaoCor}">● ${stat.faccaoPredominante}</span>`
        : `<strong>${nome}</strong><br/><em>Sem registros</em>`

      layer.bindTooltip(tooltip, { sticky: true, className: 'mapa-faccao-tooltip' })

      layer.on({
        mouseover: (e) => {
          const l = e.target as L.Path
          l.setStyle({ fillOpacity: 0.85, weight: 2.5 })
        },
        mouseout: (e) => {
          const l = e.target as L.Path
          l.setStyle(styleFeature(feature))
        },
        click: () => onSelect(ibge, nome),
      })
    },
    [statsByIbge, onSelect, styleFeature]
  )

  const flyIbge = highlightIbge ?? selectedIbge

  return (
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
  )
}