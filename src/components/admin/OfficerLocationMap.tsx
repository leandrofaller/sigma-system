'use client'

import { useEffect, useState } from 'react'
import { MapPin, AlertCircle, RefreshCw, Eye, Download, Clock } from 'lucide-react'

interface OfficerLocation {
  userId: string
  user: {
    id: string
    name: string
    email: string
  }
  latitude: number
  longitude: number
  accuracy?: number
  timestamp: string
  source: string
  batteryLevel?: number
}

export function OfficerLocationMap() {
  const [locations, setLocations] = useState<OfficerLocation[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [selectedOfficer, setSelectedOfficer] = useState<string | null>(null)

  // Carregar localizações
  const fetchLocations = async () => {
    try {
      setLoading(true)
      const res = await fetch('/api/officers/locations')
      if (!res.ok) throw new Error('Erro ao buscar localizações')

      const data = await res.json()
      setLocations(data.locations || [])
      setError(null)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // Auto-refresh
  useEffect(() => {
    fetchLocations()

    if (!autoRefresh) return

    const interval = setInterval(fetchLocations, 10000) // 10 segundos
    return () => clearInterval(interval)
  }, [autoRefresh])

  const handleViewHistory = (officerId: string) => {
    setSelectedOfficer(officerId)
    // Abrir modal ou navegar para histórico
    window.location.href = `/admin/monitoramento/historico/${officerId}`
  }

  const handleExportData = async (officerId: string) => {
    try {
      const res = await fetch(
        `/api/officers/${officerId}/locations/history?days=7&limit=10000`
      )
      if (!res.ok) throw new Error('Erro ao exportar')

      const data = await res.json()

      // Criar CSV
      const csv = [
        ['Timestamp', 'Latitude', 'Longitude', 'Acurácia (m)', 'Altitude (m)', 'Velocidade (m/s)', 'Bateria'].join(
          ','
        ),
        ...data.history.map((h: any) =>
          [
            new Date(h.timestamp).toLocaleString('pt-BR'),
            h.latitude,
            h.longitude,
            h.accuracy?.toFixed(0) || '-',
            h.altitude?.toFixed(0) || '-',
            h.speed?.toFixed(1) || '-',
            h.batteryLevel || '-',
          ].join(',')
        ),
      ].join('\n')

      // Download
      const blob = new Blob([csv], { type: 'text/csv' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `location-history-${officerId}-${new Date().toISOString().split('T')[0]}.csv`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      alert(`Erro ao exportar: ${err}`)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header com controles */}
      <div className="flex items-center justify-between bg-white rounded-lg p-4 border border-gray-200">
        <div className="flex items-center gap-3">
          <MapPin className="w-5 h-5 text-blue-600" />
          <div>
            <h2 className="font-bold text-lg">Mapa de Localização em Tempo Real</h2>
            <p className="text-sm text-gray-600">
              {locations.length} policial(is) online{' '}
              {autoRefresh && (
                <span className="animate-pulse">● Atualizando a cada 10s</span>
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={fetchLocations}
            disabled={loading}
            className="p-2 hover:bg-gray-100 rounded-lg transition disabled:opacity-50"
            title="Atualizar agora"
          >
            <RefreshCw
              className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`}
            />
          </button>

          <label className="flex items-center gap-2 px-3 py-2 hover:bg-gray-100 rounded-lg cursor-pointer transition">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="rounded"
            />
            <span className="text-sm font-medium">Auto-refresh</span>
          </label>
        </div>
      </div>

      {/* Erro */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-red-900">Erro ao carregar localizações</p>
            <p className="text-sm text-red-700 mt-1">{error}</p>
          </div>
        </div>
      )}

      {/* Grid de policiais */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {locations.length === 0 && !loading ? (
          <div className="col-span-full text-center py-12 text-gray-500">
            <MapPin className="w-12 h-12 mx-auto mb-4 opacity-30" />
            <p>Nenhuma localização registrada</p>
          </div>
        ) : (
          locations.map((loc) => (
            <div
              key={loc.userId}
              className="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-md transition"
            >
              {/* Cabeçalho */}
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="font-bold text-gray-900">{loc.user.name}</h3>
                  <p className="text-xs text-gray-500">{loc.user.email}</p>
                </div>
                {loc.batteryLevel !== undefined && (
                  <div
                    className={`px-2 py-1 rounded text-xs font-semibold ${
                      loc.batteryLevel > 50
                        ? 'bg-green-100 text-green-800'
                        : loc.batteryLevel > 20
                          ? 'bg-yellow-100 text-yellow-800'
                          : 'bg-red-100 text-red-800'
                    }`}
                  >
                    {loc.batteryLevel}%
                  </div>
                )}
              </div>

              {/* Localização */}
              <div className="space-y-2 mb-4 p-3 bg-gray-50 rounded border border-gray-200">
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-blue-600" />
                  <code className="text-sm font-mono text-gray-900">
                    {loc.latitude.toFixed(6)}, {loc.longitude.toFixed(6)}
                  </code>
                </div>

                {loc.accuracy && (
                  <div className="flex items-center gap-2 text-xs text-gray-600">
                    <span>±</span>
                    <span>{loc.accuracy.toFixed(0)}m de acurácia</span>
                  </div>
                )}

                <div className="flex items-center gap-2 text-xs text-gray-600">
                  <Clock className="w-3 h-3" />
                  {new Date(loc.timestamp).toLocaleTimeString('pt-BR')}
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-2">
                <button
                  onClick={() => handleViewHistory(loc.userId)}
                  className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-sm font-medium"
                >
                  <Eye className="w-4 h-4" />
                  Histórico
                </button>

                <button
                  onClick={() => handleExportData(loc.userId)}
                  className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-gray-200 text-gray-900 rounded-lg hover:bg-gray-300 transition text-sm font-medium"
                >
                  <Download className="w-4 h-4" />
                  Exportar
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Nota de auditoria */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-900">
        <p className="font-semibold mb-1">📋 Auditoria</p>
        <p>Todos os acessos a localização de policiais são registrados e podem ser consultados em Auditoria.</p>
      </div>
    </div>
  )
}
