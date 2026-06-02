'use client'

import { useEffect, useState } from 'react'
import { AlertCircle, RefreshCw, Download, Shield } from 'lucide-react'

interface AuditLog {
  id: string
  adminId: string
  admin: {
    name: string
    email: string
  }
  officerId: string
  officer?: {
    name: string
    email: string
  } | null
  action: string
  details?: string
  ipAddress?: string
  timestamp: string
}

interface AuditStats {
  count: number
  period: {
    from: string
    to: string
    days: number
  }
  byAction: Record<string, number>
  audits: AuditLog[]
}

export default function LocationAuditClient() {
  const [audits, setAudits] = useState<AuditLog[]>([])
  const [stats, setStats] = useState<AuditStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [days, setDays] = useState(30)
  const [limit, setLimit] = useState(500)

  const fetchAudits = async () => {
    try {
      setLoading(true)
      const res = await fetch(
        `/api/officers/locations/audit?days=${days}&limit=${limit}`
      )
      if (!res.ok) throw new Error('Erro ao buscar auditoria')

      const data = await res.json()
      setAudits(data.audits || [])
      setStats(data)
      setError(null)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchAudits()
  }, [days, limit])

  const handleExport = () => {
    try {
      const csv = [
        [
          'Data/Hora',
          'Admin',
          'Email Admin',
          'Policial',
          'Email Policial',
          'Ação',
          'Detalhes',
          'IP',
        ].join(','),
        ...audits.map((a) =>
          [
            new Date(a.timestamp).toLocaleString('pt-BR'),
            a.admin.name,
            a.admin.email,
            a.officer?.name || '-',
            a.officer?.email || '-',
            a.action,
            a.details || '-',
            a.ipAddress || '-',
          ]
            .map((v) => `"${v}"`) // Escapar aspas
            .join(',')
        ),
      ].join('\n')

      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
      const link = document.createElement('a')
      const url = URL.createObjectURL(blob)
      link.setAttribute('href', url)
      link.setAttribute('download', `auditoria-localizacoes-${new Date().toISOString().split('T')[0]}.csv`)
      link.style.visibility = 'hidden'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    } catch (err) {
      alert(`Erro ao exportar: ${err}`)
    }
  }

  const getActionBadge = (action: string) => {
    switch (action) {
      case 'VIEW_ALL_LOCATIONS_MAP':
        return {
          label: 'Mapa de Localizações',
          color: 'bg-blue-100 text-blue-800',
        }
      case 'VIEW_LOCATION_HISTORY':
        return { label: 'Ver Histórico', color: 'bg-purple-100 text-purple-800' }
      default:
        return { label: action, color: 'bg-gray-100 text-gray-800' }
    }
  }

  return (
    <div className="space-y-6">
      {/* Filtros */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="flex flex-wrap gap-4 items-end">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Período
            </label>
            <select
              value={days}
              onChange={(e) => setDays(parseInt(e.target.value))}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value={1}>Último dia</option>
              <option value={7}>7 dias</option>
              <option value={30}>30 dias</option>
              <option value={90}>90 dias</option>
              <option value={365}>Último ano</option>
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
              <option value={250}>250</option>
              <option value={500}>500</option>
              <option value={1000}>1.000</option>
            </select>
          </div>

          <button
            onClick={fetchAudits}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50 font-medium"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Atualizar
          </button>

          <button
            onClick={handleExport}
            disabled={loading || audits.length === 0}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition disabled:opacity-50 disabled:cursor-not-allowed font-medium"
          >
            <Download className="w-4 h-4" />
            Exportar CSV
          </button>
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Total de Acessos</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">
                  {stats.count}
                </p>
              </div>
              <Shield className="w-8 h-8 text-blue-500 opacity-50" />
            </div>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <p className="text-sm text-gray-600 font-semibold mb-2">Período</p>
            <p className="text-xs text-gray-700">
              {new Date(stats.period.from).toLocaleDateString('pt-BR')} a{' '}
              {new Date(stats.period.to).toLocaleDateString('pt-BR')}
            </p>
            <p className="text-xs text-gray-600 mt-1">({stats.period.days} dias)</p>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <p className="text-sm text-gray-600 font-semibold mb-2">Tipos de Ação</p>
            <div className="space-y-1">
              {Object.entries(stats.byAction).map(([action, count]) => (
                <div key={action} className="flex justify-between text-xs">
                  <span className="text-gray-700">{action}</span>
                  <span className="font-bold text-gray-900">{count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Erro */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-red-900">Erro ao carregar auditoria</p>
            <p className="text-sm text-red-700 mt-1">{error}</p>
          </div>
        </div>
      )}

      {/* Tabela de auditoria */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="p-4 border-b border-gray-200 bg-gray-50">
          <h3 className="font-bold text-lg">Log de Auditoria</h3>
          <p className="text-sm text-gray-600 mt-1">
            {loading ? 'Carregando...' : `${audits.length} registros`}
          </p>
        </div>

        {loading ? (
          <div className="p-8 text-center text-gray-500">
            <div className="inline-block animate-spin mb-4">
              <Shield className="w-8 h-8" />
            </div>
            <p>Carregando auditoria...</p>
          </div>
        ) : audits.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <Shield className="w-12 h-12 mx-auto mb-4 opacity-30" />
            <p>Nenhum registro de auditoria encontrado</p>
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
                    Admin
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">
                    Policial
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">
                    Ação
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">
                    Detalhes
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">
                    IP
                  </th>
                </tr>
              </thead>
              <tbody>
                {audits.map((audit, idx) => {
                  const badge = getActionBadge(audit.action)
                  return (
                    <tr
                      key={audit.id}
                      className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}
                    >
                      <td className="px-4 py-3 text-gray-900 font-mono text-xs whitespace-nowrap">
                        {new Date(audit.timestamp).toLocaleString('pt-BR')}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-semibold text-gray-900">
                          {audit.admin.name}
                        </div>
                        <div className="text-xs text-gray-600">
                          {audit.admin.email}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {audit.officer ? (
                          <>
                            <div className="font-semibold text-gray-900">
                              {audit.officer.name}
                            </div>
                            <div className="text-xs text-gray-600">
                              {audit.officer.email}
                            </div>
                          </>
                        ) : (
                          <span className="text-gray-500 text-xs">
                            (mapa geral)
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-block px-2 py-1 rounded text-xs font-semibold ${badge.color}`}
                        >
                          {badge.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-700 text-xs">
                        {audit.details || '-'}
                      </td>
                      <td className="px-4 py-3 text-gray-700 font-mono text-xs">
                        {audit.ipAddress || '-'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Aviso de conformidade */}
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
        <div className="flex gap-3">
          <Shield className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-amber-900">Conformidade</p>
            <p className="text-sm text-amber-800 mt-1">
              Todos os acessos a dados de geolocalização são registrados neste log para
              fins de auditoria e conformidade. A manipulação deste log é proibida e
              rastreada.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
