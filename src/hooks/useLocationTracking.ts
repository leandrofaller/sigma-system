'use client'

import { useEffect, useState, useRef } from 'react'

interface LocationData {
  latitude: number
  longitude: number
  accuracy?: number
  altitude?: number
  speed?: number
  heading?: number
  timestamp: number
}

interface UseLocationTrackingOptions {
  enabled?: boolean
  interval?: number // milliseconds entre uploads
  highAccuracy?: boolean
  timeout?: number
  maximumAge?: number
}

/**
 * Hook para rastreamento contínuo de geolocalização
 * Coleta localização e envia para servidor periodicamente
 */
export function useLocationTracking(options: UseLocationTrackingOptions = {}) {
  const {
    enabled = true,
    interval = 30000, // 30 segundos
    highAccuracy = true,
    timeout = 10000,
    maximumAge = 0,
  } = options

  const [location, setLocation] = useState<LocationData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tracking, setTracking] = useState(false)
  const watchIdRef = useRef<number | null>(null)
  const uploadIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const locationCacheRef = useRef<LocationData | null>(null)
  const batteryRef = useRef<number | null>(null)

  // Obter nível de bateria (se disponível)
  useEffect(() => {
    if (!enabled || !('getBattery' in navigator)) return

    ;(navigator as any).getBattery?.().then((battery: any) => {
      batteryRef.current = Math.round(battery.level * 100)

      battery.addEventListener('levelchange', () => {
        batteryRef.current = Math.round(battery.level * 100)
      })
    })
  }, [enabled])

  // Iniciar rastreamento contínuo
  useEffect(() => {
    if (!enabled || !('geolocation' in navigator)) {
      if (!('geolocation' in navigator)) {
        setError('Geolocalização não disponível')
      }
      return
    }

    setTracking(true)

    // Configurar watch position (contínuo)
    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const {
          coords: { latitude, longitude, accuracy, altitude, speed, heading },
          timestamp,
        } = position

        const locationData: LocationData = {
          latitude,
          longitude,
          accuracy,
          altitude: altitude || undefined,
          speed: speed || undefined,
          heading: heading || undefined,
          timestamp,
        }

        setLocation(locationData)
        locationCacheRef.current = locationData
        setError(null)

        console.log(
          `[Location] ${latitude.toFixed(4)}, ${longitude.toFixed(4)} (acurácia: ${accuracy?.toFixed(0)}m)`
        )
      },
      (err) => {
        setError(err.message)
        console.error('[Location Error]', err)
      },
      {
        enableHighAccuracy: highAccuracy,
        timeout,
        maximumAge,
      }
    )

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current)
        watchIdRef.current = null
      }
    }
  }, [enabled, highAccuracy, timeout, maximumAge])

  // Enviar para servidor periodicamente
  useEffect(() => {
    if (!enabled || !tracking) return

    const uploadLocation = async () => {
      if (!locationCacheRef.current) return

      try {
        const { latitude, longitude, accuracy, altitude, speed } = locationCacheRef.current

        await fetch('/api/officers/locations', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            latitude,
            longitude,
            accuracy,
            altitude,
            speed,
            deviceId: 'web-client',
            source: 'GPS',
            batteryLevel: batteryRef.current,
          }),
        }).catch((err) => {
          // Não falhar se offline, apenas logar
          console.warn('[Location Upload] Offline:', err.message)
        })
      } catch (err) {
        console.error('[Location Upload Error]', err)
      }
    }

    // Upload inicial
    uploadLocation()

    // Upload periódico
    uploadIntervalRef.current = setInterval(uploadLocation, interval)

    return () => {
      if (uploadIntervalRef.current !== null) {
        clearInterval(uploadIntervalRef.current)
        uploadIntervalRef.current = null
      }
    }
  }, [enabled, tracking, interval])

  const stop = () => {
    setTracking(false)
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current)
      watchIdRef.current = null
    }
    if (uploadIntervalRef.current !== null) {
      clearInterval(uploadIntervalRef.current)
      uploadIntervalRef.current = null
    }
  }

  return {
    location,
    error,
    tracking,
    stop,
  }
}
