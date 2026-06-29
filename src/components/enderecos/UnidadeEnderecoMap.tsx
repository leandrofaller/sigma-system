'use client'

import { useEffect, useState } from 'react'
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { enderecoCompleto, type UnidadeEndereco } from '@/lib/unidades-enderecos-ro'

delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

const DEFAULT_CENTER: [number, number] = [-10.83, -63.17]

function FlyTo({ lat, lng, zoom }: { lat: number; lng: number; zoom: number }) {
  const map = useMap()
  useEffect(() => {
    map.flyTo([lat, lng], zoom, { duration: 0.6 })
  }, [lat, lng, zoom, map])
  return null
}

function temCoordenadas(u: UnidadeEndereco): boolean {
  return u.latitude != null && u.longitude != null && !isNaN(u.latitude) && !isNaN(u.longitude)
}

export default function UnidadeEnderecoMap({ unidade }: { unidade: UnidadeEndereco }) {
  const [geocoded, setGeocoded] = useState<{ lat: number; lng: number } | null>(null)
  const hasCoords = temCoordenadas(unidade)

  useEffect(() => {
    if (hasCoords) {
      setGeocoded(null)
      return
    }

    let cancelled = false
    const q = encodeURIComponent(enderecoCompleto(unidade))
    fetch(`https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1`, {
      headers: { 'Accept-Language': 'pt-BR' },
    })
      .then((r) => (r.ok ? r.json() : []))
      .then((results: { lat: string; lon: string }[]) => {
        if (!cancelled && results[0]) {
          setGeocoded({ lat: parseFloat(results[0].lat), lng: parseFloat(results[0].lon) })
        }
      })
      .catch(() => {})

    return () => { cancelled = true }
  }, [unidade.id, unidade.endereco, unidade.comarca, unidade.cep, hasCoords])

  const lat = hasCoords ? unidade.latitude! : geocoded?.lat ?? null
  const lng = hasCoords ? unidade.longitude! : geocoded?.lng ?? null
  const center: [number, number] = lat != null && lng != null ? [lat, lng] : DEFAULT_CENTER
  const zoom = lat != null && lng != null ? (hasCoords ? 16 : 15) : 7

  return (
    <MapContainer center={center} zoom={zoom} className="h-full w-full" scrollWheelZoom>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {lat != null && lng != null && (
        <>
          <FlyTo lat={lat} lng={lng} zoom={zoom} />
          <Marker position={[lat, lng]}>
            <Popup>
              <span className="font-bold text-sm">{unidade.unidade}</span>
              <br />
              <span className="text-xs">{unidade.endereco}</span>
            </Popup>
          </Marker>
        </>
      )}
    </MapContainer>
  )
}