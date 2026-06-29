'use client'

import { useState, useCallback } from 'react'
import dynamic from 'next/dynamic'
import { MapPin, Loader2 } from 'lucide-react'

const GeoMapInner = dynamic(() => import('./UnidadeGeoPickerMap'), { ssr: false })

interface Props {
  latitude: number | null
  longitude: number | null
  onChange: (lat: number | null, lng: number | null) => void
}

export function UnidadeGeoPicker({ latitude, longitude, onChange }: Props) {
  const [loadingGeo, setLoadingGeo] = useState(false)

  const usarMinhaLocalizacao = () => {
    if (!navigator.geolocation) return
    setLoadingGeo(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        onChange(pos.coords.latitude, pos.coords.longitude)
        setLoadingGeo(false)
      },
      () => setLoadingGeo(false),
      { enableHighAccuracy: true, timeout: 12000 }
    )
  }

  const limpar = useCallback(() => onChange(null, null), [onChange])

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[10px] font-bold uppercase text-subtle tracking-wide">
          Geolocalização (Google Maps)
        </p>
        <div className="flex gap-1.5">
          <button type="button" onClick={usarMinhaLocalizacao} disabled={loadingGeo} className="btn-secondary text-[10px] px-2 py-1">
            {loadingGeo ? <Loader2 className="w-3 h-3 animate-spin" /> : <MapPin className="w-3 h-3" />}
            GPS
          </button>
          {(latitude != null || longitude != null) && (
            <button type="button" onClick={limpar} className="btn-secondary text-[10px] px-2 py-1">
              Limpar
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="text-[10px] text-subtle font-semibold">Latitude</span>
          <input
            type="number"
            step="any"
            value={latitude ?? ''}
            onChange={(e) => {
              const v = e.target.value
              onChange(v === '' ? null : parseFloat(v), longitude)
            }}
            placeholder="-8.7612"
            className="w-full mt-0.5 px-2 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"
          />
        </label>
        <label className="block">
          <span className="text-[10px] text-subtle font-semibold">Longitude</span>
          <input
            type="number"
            step="any"
            value={longitude ?? ''}
            onChange={(e) => {
              const v = e.target.value
              onChange(latitude, v === '' ? null : parseFloat(v))
            }}
            placeholder="-63.9039"
            className="w-full mt-0.5 px-2 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"
          />
        </label>
      </div>

      <p className="text-[10px] text-subtle">Clique no mapa para definir o ponto exato da unidade.</p>
      <div className="h-44 rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700">
        <GeoMapInner latitude={latitude} longitude={longitude} onPick={onChange} />
      </div>
    </div>
  )
}