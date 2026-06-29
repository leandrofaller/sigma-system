'use client'

import { useEffect } from 'react'
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

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
      map.flyTo([lat, lng], Math.max(map.getZoom(), 14), { duration: 0.6 })
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
    <MapContainer center={center} zoom={latitude != null ? 14 : 7} className="h-full w-full" scrollWheelZoom>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <ClickHandler onPick={onPick} />
      <FlyTo lat={latitude} lng={longitude} />
      {latitude != null && longitude != null && <Marker position={[latitude, longitude]} />}
    </MapContainer>
  )
}