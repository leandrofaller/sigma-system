'use client'

import { useEffect, useState } from 'react'
import {
  MapPin,
  AlertCircle,
  Download,
  Calendar,
  TrendingUp,
  Zap,
} from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, AreaChart, Area } from 'recharts'

interface LocationHistory {
  id: string
  latitude: number
  longitude: number
  accuracy?: number
  altitude?: number
  speed?: number
  timestamp: string
  source: string
  batteryLevel?: number
}

interface OfficerLocationHistoryProps {
  officerId: string
}

export default function OfficerLocationHistory({
  officerId,
}: OfficerLocationHistoryProps) {
  const [history, setHistory] = useState<LocationHistory[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [days, setDays] = useState(7)
  const [limit, setLimit] = useState(1000)

  // Carregar histórico
  const fetchHistory = async () => {
    try {
      setLoading(true)
      const res = await fetch(
        `/api/officers/${officerId}/locations/history?days=${days}&limit=${limit}`
      )
      if (!res.ok) throw new Error('Erro ao buscar histórico')

      const data = await res.json()
      setHistory(data.history || [])
      setError(null)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchHistory()
  }, [days, limit])

  // Preparar dados para gráfico (reduzir pontos para performance)
  const chartData = history
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
    .slice(-100) // Últimos 100 pontos
    .map((loc, i) => ({
      time: new Date(loc.timestamp).toLocaleTimeString('pt-BR'),
      accuracy: loc.accuracy ? Math.round(loc.accuracy) : 0,
      speed: loc.speed ? (loc.speed * 3.6).toFixed(1) : 0, // m/s para km/h
      battery: loc.batteryLevel || 0,
      index: i,
    }))

  // Calcular stats
  const stats = {
    totalPoints: history.length,
    avgAccuracy: history.length
      ? Math.round(
          history.reduce((sum, h) => sum + (h.accuracy || 0), 0) / history.length
        )
      : 0,
    maxSpeed: history.length
      ? Math.max(...history.map((h) => (h.speed || 0) * 3.6))
      : 0,
    avgBattery: history.length
      ? Math.round(
          history.reduce((sum, h) => sum + (h.batteryLevel || 0), 0) / history.length
        )
      : 0,
  }

  const handleExport = async () => {
    try {
      // Usar dados já carregados
      const csv = [
        [
          'Data/Hora',
          'Latitude',
          'Longitude',
          'Acurácia (m)',
          'Altitude (m)',
          'Velocidade (km/h)',
          'Bateria (%)',
          'Fonte',
        ].join(','),
        ...history.map((h) =>
          [
            new Date(h.timestamp).toLocaleString('pt-BR'),
            h.latitude.toFixed(6),
            h.longitude.toFixed(6),
            h.accuracy?.toFixed(0) || '-',
            h.altitude?.toFixed(0) || '-',
            h.speed ? (h.speed * 3.6).toFixed(2) : '-',
            h.batteryLevel || '-',
            h.source,
          ].join(',')
        ),
      ].join('\n')

      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
      const link = document.createElement('a')
      const url = URL.createObjectURL(blob)
      link.setAttribute('href', url)
      link.setAttribute('download', `historico-${officerId}-${new Date().toISOString().split('T')[0]}.csv`)
      link.style.visibility = 'hidden'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    } catch (err) {
      alert(`Erro ao exportar: ${err}`)
    }
  }

  return (
    <div className="space-y-6">
      {/* Filtros */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="flex flex-wrap gap-4 items-end">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <Calendar className="w-4 h-4 inline mr-2" />
              Últimos
            </label>
            <select
              value={days}
              onChange={(e) => setDays(parseInt(e.target.value))}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value={1}>1 dia</option>
              <option value={7}>7 dias</option>
              <option value={30}>30 dias</option>
              <option value={90}>90 dias</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Limite de registros
            </label>
            <select
              value={limit}
              onChange={(e) => setLimit(parseInt(e.target.value))}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value={100}>100</option>
              <option value={500}>500</option>
              <option value={1000}>1.000</option>
              <option value={5000}>5.000</option>
            </select>
          </div>

          <button
            onClick={handleExport}
            disabled={loading || history.length === 0}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition disabled:opacity-50 disabled:cursor-not-allowed font-medium"
          >
            <Download className="w-4 h-4" />
            Exportar CSV
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      {history.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Total de Pontos</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">
                  {stats.totalPoints}
                </p>
              </div>
              <MapPin className="w-8 h-8 text-blue-500 opacity-50" />
            </div>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Acurácia Média</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">
                  ±{stats.avgAccuracy}m
                </p>
              </div>
              <TrendingUp className="w-8 h-8 text-green-500 opacity-50" />
            </div>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Vel. Máxima</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">
                  {stats.maxSpeed.toFixed(1)} km/h
                </p>
              </div>
              <TrendingUp className="w-8 h-8 text-orange-500 opacity-50" />
            </div>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Bateria Média</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">
                  {stats.avgBattery}%
                </p>
              </div>
              <Zap className="w-8 h-8 text-yellow-500 opacity-50" />
            </div>
          </div>
        </div>
      )}

      {/* Erro */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-red-900">Erro ao carregar histórico</p>
            <p className="text-sm text-red-700 mt-1">{error}</p>
          </div>
        </div>
      )}

      {/* Gráfico de Acurácia */}
      {history.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <h3 className="font-bold text-lg mb-4">Acurácia do GPS (últimas 100 coletas)</h3>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="colorAccuracy" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.1} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="time" />
              <YAxis />
              <Tooltip
                formatter={(value) => `±${value}m`}
                labelFormatter={(label) => `Ponto ${label}`}
              />
              <Area
                type="monotone"
                dataKey="accuracy"
                stroke="#3b82f6"
                fillOpacity={1}
                fill="url(#colorAccuracy)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Gráfico de Velocidade */}
      {history.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <h3 className="font-bold text-lg mb-4">Velocidade (últimas 100 coletas)</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="time" />
              <YAxis />
              <Tooltip
                formatter={(value) => `${value} km/h`}
                labelFormatter={(label) => `Ponto ${label}`}
              />
              <Line
                type="monotone"
                dataKey="speed"
                stroke="#f97316"
                strokeWidth={2}
                dot={false}
                name="Velocidade (km/h)"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Tabela de dados */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="p-4 border-b border-gray-200 bg-gray-50">
          <h3 className="font-bold text-lg">Histórico Detalhado</h3>
          <p className="text-sm text-gray-600 mt-1">
            {loading ? 'Carregando...' : `${history.length} registros`}
          </p>
        </div>

        {loading ? (
          <div className="p-8 text-center text-gray-500">
            <div className="inline-block animate-spin mb-4">
              <MapPin className="w-8 h-8" />
            </div>
            <p>Carregando histórico...</p>
          </div>
        ) : history.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <MapPin className="w-12 h-12 mx-auto mb-4 opacity-30" />
            <p>Nenhum registro encontrado</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">
                    Data/Hora
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">
                    Latitude
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">
                    Longitude
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">
                    Acurácia
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">
                    Altitude
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">
                    Velocidade
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">
                    Bateria
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">
                    Fonte
                  </th>
                </tr>
              </thead>
              <tbody>
                {history.map((h, idx) => (
                  <tr
                    key={h.id}
                    className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}
                  >
                    <td className="px-4 py-3 text-gray-900 font-mono text-xs">
                      {new Date(h.timestamp).toLocaleString('pt-BR')}
                    </td>
                    <td className="px-4 py-3 text-gray-700 font-mono">
                      {h.latitude.toFixed(6)}
                    </td>
                    <td className="px-4 py-3 text-gray-700 font-mono">
                      {h.longitude.toFixed(6)}
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {h.accuracy ? `±${h.accuracy.toFixed(0)}m` : '-'}
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {h.altitude ? `${h.altitude.toFixed(0)}m` : '-'}
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {h.speed ? `${(h.speed * 3.6).toFixed(1)} km/h` : '-'}
                    </td>
                    <td className="px-4 py-3">
                      {h.batteryLevel !== undefined ? (
                        <span
                          className={`inline-block px-2 py-1 rounded text-xs font-semibold ${
                            h.batteryLevel > 50
                              ? 'bg-green-100 text-green-800'
                              : h.batteryLevel > 20
                                ? 'bg-yellow-100 text-yellow-800'
                                : 'bg-red-100 text-red-800'
                          }`}
                        >
                          {h.batteryLevel}%
                        </span>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-700 text-xs">{h.source}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Nota de auditoria */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-900">
        <p className="font-semibold mb-1">📋 Auditoria</p>
        <p>
          Este acesso ao histórico de localização foi registrado no log de auditoria.
          Administradores podem consultar todos os acessos em Auditoria de Localizações.
        </p>
      </div>
    </div>
  )
}
