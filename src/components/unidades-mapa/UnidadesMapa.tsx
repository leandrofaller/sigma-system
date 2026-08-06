'use client'

import { useMemo, useCallback, useEffect } from 'react'
import { MapContainer, TileLayer, GeoJSON, useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { IBGE_PARA_NOME, CENTRO_RONDONIA, ZOOM_ESTADO } from '@/lib/municipios-rondonia'

// Correção dos caminhos dos ícones do Leaflet padrão
delete (L.Icon.Default.prototype as any)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

export interface MunicipioUnidadesStats {
  nome: string
  ibge: number | null
  totalApenados: number
  totalUnidades: number
  unidades: Array<{ nome: string; quantidade: number }>
}

interface Props {
  geojson: GeoJSON.FeatureCollection | null
  municipios: MunicipioUnidadesStats[]
  statsByIbge: Record<number, MunicipioUnidadesStats>
  statsByNome: Record<string, MunicipioUnidadesStats>
  maxApenados: number
  selectedIbge: number | null
  onSelect: (ibge: number, nome: string) => void
  mapZoom?: number
  lockZoom?: boolean
  onZoomChange?: (zoom: number) => void
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
    if (!geojson) return

    if (!ibge) {
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
      map.flyToBounds(bounds, {
        paddingTopLeft: [40, 40],
        paddingBottomRight: [40, 220],
        maxZoom: 10,
        duration: 1.15,
      })
    }
  }, [ibge, geojson, map])
  return null
}

function MapZoomController({ zoom }: { zoom: number }) {
  const map = useMap()
  useEffect(() => {
    if (map.getZoom() !== zoom) {
      map.setZoom(zoom)
    }
  }, [zoom, map])
  return null
}

function ScrollWheelZoomController({ lockZoom }: { lockZoom: boolean }) {
  const map = useMap()
  useEffect(() => {
    if (lockZoom) {
      map.scrollWheelZoom.disable()
      map.doubleClickZoom.disable()
      map.boxZoom.disable()
      map.touchZoom.disable()
    } else {
      map.scrollWheelZoom.enable()
      map.doubleClickZoom.enable()
      map.boxZoom.enable()
      map.touchZoom.enable()
    }
  }, [lockZoom, map])
  return null
}

function SyncMapZoom({ onZoomChange }: { onZoomChange?: (zoom: number) => void }) {
  const map = useMapEvents({
    zoomend() {
      if (onZoomChange) {
        onZoomChange(map.getZoom())
      }
    }
  })
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

function buildTooltip(stat: MunicipioUnidadesStats | undefined, nome: string): string {
  if (!stat || stat.totalApenados <= 0) {
    return `<div class="p-1">
      <strong class="text-sm block font-bold text-gray-900 dark:text-white">${nome}</strong>
      <span class="text-xs text-gray-500 italic block mt-0.5">Sem unidades prisionais cadastradas</span>
    </div>`
  }

  const unLabel = stat.totalUnidades === 1 ? 'unidade prisional' : 'unidades prisionais'
  
  return `<div class="p-1.5 min-w-[150px]">
    <span class="text-xs text-gray-400 font-medium block uppercase tracking-wider">${nome}</span>
    <div class="mt-1 flex items-baseline gap-1">
      <span class="text-lg font-extrabold text-blue-600 dark:text-blue-400">${stat.totalApenados}</span>
      <span class="text-xs text-gray-500 font-semibold">preso(s) custodiado(s)</span>
    </div>
    <div class="mt-1 pt-1 border-t border-gray-100 dark:border-gray-700/50 text-[10px] text-gray-500 font-medium flex items-center gap-1">
      <span class="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
      ${stat.totalUnidades} ${unLabel}
    </div>
  </div>`
}

export default function UnidadesMapa({
  geojson: rawGeo,
  municipios,
  statsByIbge,
  statsByNome,
  maxApenados,
  selectedIbge,
  onSelect,
  mapZoom = 8,
  lockZoom = false,
  onZoomChange,
}: Props) {
  const geojson = useMemo(() => (rawGeo ? enrichGeoJson(rawGeo) : null), [rawGeo])
  
  const geoKey = useMemo(
    () =>
      `${selectedIbge ?? ''}-${maxApenados}-${municipios
        .map((m) => `${m.ibge}:${m.totalApenados}:${m.totalUnidades}`)
        .join('|')}`,
    [selectedIbge, maxApenados, municipios]
  )

  const styleFeature = useCallback(
    (feature?: GeoJSON.Feature) => {
      const ibge = parseInt(String((feature?.properties as { ibge?: number })?.ibge), 10)
      const nome = (feature?.properties as { nome?: string })?.nome || ''
      const stat = statsByIbge[ibge] || statsByNome[nome]
      const total = stat?.totalApenados ?? 0
      const isSelected = selectedIbge === ibge
      const empty = total <= 0

      // Estilo de borda e cores
      let stroke = empty ? '#475569' : '#93c5fd'
      let weight = empty ? 0.8 : 1.5
      let fillOpacity = 0.08
      let fillColor = '#1e293b' // Cinza/azul escuro para vazio

      if (!empty) {
        // Cor azul gradativa conforme a quantidade de presos
        fillColor = '#2563eb'
        // Opacidade vai de 0.15 a 0.90
        fillOpacity = 0.15 + (total / maxApenados) * 0.75
      }

      if (isSelected) {
        stroke = '#fbbf24' // Borda dourada para o município selecionado
        weight = 3.5
        fillOpacity = empty ? 0.3 : Math.min(0.95, fillOpacity + 0.15)
      }

      return {
        fillColor,
        fillOpacity,
        color: stroke,
        weight,
        opacity: 1,
        className: isSelected ? 'mapa-mun-focused transition-all' : empty ? 'mapa-mun-empty' : 'mapa-mun transition-all',
      } as L.PathOptions
    },
    [statsByIbge, statsByNome, maxApenados, selectedIbge]
  )

  const onEachFeature = useCallback(
    (feature: GeoJSON.Feature, layer: L.Layer) => {
      const ibge = parseInt(String((feature.properties as { ibge?: number })?.ibge), 10)
      const nome = (feature.properties as { nome?: string })?.nome || IBGE_PARA_NOME[ibge] || ''
      const stat = statsByIbge[ibge] || statsByNome[nome]

      layer.unbindTooltip()
      layer.bindTooltip(buildTooltip(stat, nome), { 
        sticky: true, 
        className: 'mapa-unidade-tooltip dark:!bg-gray-900 dark:!border-gray-700 !rounded-xl !p-1 !shadow-lg' 
      })

      layer.on({
        mouseover: (e) => {
          const l = e.target as L.Path
          const base = styleFeature(feature)
          const isSelected = selectedIbge === ibge
          if (isSelected) {
            l.setStyle({ ...base, weight: 4.5, fillOpacity: 0.95 })
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
          if (selectedIbge === ibge) l.bringToFront()
        },
        click: () => onSelect(ibge, nome),
      })
    },
    [statsByIbge, statsByNome, onSelect, styleFeature, selectedIbge]
  )

  return (
    <div className="relative h-full w-full">
      <MapContainer
        center={CENTRO_RONDONIA}
        zoom={ZOOM_ESTADO}
        className="h-full w-full rounded-2xl z-0"
        scrollWheelZoom={!lockZoom}
        zoomControl={true}
        attributionControl={false}
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
        <FlyToMunicipio ibge={selectedIbge} geojson={geojson} />
        <MapZoomController zoom={mapZoom} />
        <ScrollWheelZoomController lockZoom={lockZoom} />
        <SyncMapZoom onZoomChange={onZoomChange} />
      </MapContainer>
    </div>
  )
}
