'use client'

import { useState, useCallback, useRef } from 'react'
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { Search, MapPin, Check, Loader2, X } from 'lucide-react'

// Fix Leaflet default icon (Next.js build issue)
delete (L.Icon.Default.prototype as any)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

// Porto Velho / RO como centro padrão
const DEFAULT_CENTER: [number, number] = [-8.7612, -63.9039]
const DEFAULT_ZOOM = 13

interface Props {
  onSelect: (address: string) => void
}

interface GeoResult {
  display_name: string
  lat: string
  lon: string
}

function ClickHandler({ onMapClick }: { onMapClick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) { onMapClick(e.latlng.lat, e.latlng.lng) },
  })
  return null
}

export default function MiniMapPicker({ onSelect }: Props) {
  const [marker, setMarker] = useState<[number, number] | null>(null)
  const [suggestion, setSuggestion] = useState('')
  const [loadingGeo, setLoadingGeo] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<GeoResult[]>([])
  const [searching, setSearching] = useState(false)
  const mapRef = useRef<L.Map | null>(null)

  const reverseGeocode = useCallback(async (lat: number, lng: number) => {
    setLoadingGeo(true)
    setSuggestion('')
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&accept-language=pt-BR`,
        { headers: { 'Accept-Language': 'pt-BR' } }
      )
      if (res.ok) {
        const data = await res.json()
        setSuggestion(data.display_name || `${lat.toFixed(6)}, ${lng.toFixed(6)}`)
      }
    } catch {
      setSuggestion(`${lat.toFixed(6)}, ${lng.toFixed(6)}`)
    } finally {
      setLoadingGeo(false)
    }
  }, [])

  const handleMapClick = useCallback((lat: number, lng: number) => {
    setMarker([lat, lng])
    setSearchResults([])
    reverseGeocode(lat, lng)
  }, [reverseGeocode])

  const handleSearch = async () => {
    if (!searchQuery.trim()) return
    setSearching(true)
    setSearchResults([])
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}&limit=5&accept-language=pt-BR`,
        { headers: { 'Accept-Language': 'pt-BR' } }
      )
      if (res.ok) {
        const data: GeoResult[] = await res.json()
        setSearchResults(data)
      }
    } catch {}
    finally { setSearching(false) }
  }

  const selectResult = (r: GeoResult) => {
    const lat = parseFloat(r.lat)
    const lng = parseFloat(r.lon)
    setMarker([lat, lng])
    setSuggestion(r.display_name)
    setSearchResults([])
    setSearchQuery('')
    mapRef.current?.setView([lat, lng], 16)
  }

  const applyAddress = () => {
    if (suggestion) onSelect(suggestion)
  }

  return (
    <div className="rounded-xl overflow-hidden border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-900">
      {/* Search bar */}
      <div className="p-2 border-b border-gray-200 dark:border-gray-700 flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <input
            className="w-full pl-8 pr-3 py-1.5 text-xs border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
            placeholder="Buscar endereço, cidade, local..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
          />
        </div>
        <button
          type="button"
          onClick={handleSearch}
          disabled={searching}
          className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors disabled:opacity-50"
        >
          {searching ? <Loader2 className="w-3 h-3 animate-spin" /> : <Search className="w-3 h-3" />}
          Buscar
        </button>
      </div>

      {/* Search results dropdown */}
      {searchResults.length > 0 && (
        <div className="border-b border-gray-200 dark:border-gray-700 max-h-36 overflow-y-auto">
          {searchResults.map((r, i) => (
            <button
              key={i}
              type="button"
              onClick={() => selectResult(r)}
              className="w-full text-left px-3 py-2 text-xs hover:bg-purple-50 dark:hover:bg-purple-900/20 border-b border-gray-100 dark:border-gray-700 last:border-0 flex items-start gap-2"
            >
              <MapPin className="w-3 h-3 text-purple-500 mt-0.5 shrink-0" />
              <span className="text-gray-700 dark:text-gray-300 line-clamp-2">{r.display_name}</span>
            </button>
          ))}
        </div>
      )}

      {/* Map */}
      <div style={{ height: 260 }}>
        <MapContainer
          center={marker ?? DEFAULT_CENTER}
          zoom={DEFAULT_ZOOM}
          style={{ height: '100%', width: '100%' }}
          ref={mapRef}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <ClickHandler onMapClick={handleMapClick} />
          {marker && <Marker position={marker} />}
        </MapContainer>
      </div>

      {/* Address suggestion bar */}
      <div className="p-2 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 min-h-[44px] flex items-center gap-2">
        {loadingGeo ? (
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            Obtendo endereço...
          </div>
        ) : suggestion ? (
          <>
            <MapPin className="w-3.5 h-3.5 text-purple-500 shrink-0" />
            <span className="flex-1 text-xs text-gray-700 dark:text-gray-300 line-clamp-2">{suggestion}</span>
            <button
              type="button"
              onClick={applyAddress}
              className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors shrink-0"
            >
              <Check className="w-3 h-3" />
              Usar
            </button>
          </>
        ) : (
          <p className="text-xs text-gray-400 italic">
            Clique no mapa ou busque para obter o endereço
          </p>
        )}
      </div>
    </div>
  )
}
