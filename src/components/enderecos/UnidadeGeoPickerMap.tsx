'use client'

import { useEffect } from 'react'
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { UNIDADE_SATELLITE_TILE, createUnidadeMarkerIcon } from '@/lib/leaflet-unidade-map'

const unidadeMarkerIcon = createUnidadeMarkerIcon()

const DEFAULT_CENTER: [number, number] = [-10.83, -63.17]

function ClickHandler({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onPick(e.latlng.lat, e.latlng.lng)
    },
  })
  return null
}

function FlyTo({ lat, lng }: { lat: number | null; lng: number | null }) {
  const map = useMap()
  useEffect(() => {
    if (lat != null && lng != null) {
      map.flyTo([lat, lng], Math.max(map.getZoom(), 16), { duration: 0.6 })
    }
  }, [lat, lng, map])
  return null
}

export default function UnidadeGeoPickerMap({
  latitude,
  longitude,
  onPick,
}: {
  latitude: number | null
  longitude: number | null
  onPick: (lat: number, lng: number) => void
}) {
  const center: [number, number] =
    latitude != null && longitude != null ? [latitude, longitude] : DEFAULT_CENTER

  return (
    <MapContainer center={center} zoom={latitude != null ? 16 : 7} className="h-full w-full" scrollWheelZoom>
      <TileLayer
        attribution={UNIDADE_SATELLITE_TILE.attribution}
        url={UNIDADE_SATELLITE_TILE.url}
      />
      <ClickHandler onPick={onPick} />
      <FlyTo lat={latitude} lng={longitude} />
      {latitude != null && longitude != null && (
        <Marker position={[latitude, longitude]} icon={unidadeMarkerIcon} />
      )}
    </MapContainer>
  )
}