'use client'

import { useEffect, useState } from 'react'
import { AlertTriangle, AlertCircle, Info, Plus, Edit2, Trash2, Check, Clock } from 'lucide-react'

interface Maintenance {
  id: string
  title: string
  message: string
  severity: 'INFO' | 'WARNING' | 'CRITICAL'
  status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED'
  graceTimeUntil: string | null
  createdAt: string
  createdByUser: {
    name: string
    email: string
  }
}

export default function ManutencaoClient() {
  const [maintenances, setMaintenances] = useState<Maintenance[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formData, setFormData] = useState({
    title: '',
    message: '',
    severity: 'WARNING' as const,
    graceTimeUntil: '',
  })

  // Carregar avisos
  useEffect(() => {
    fetchMaintenances()
  }, [])

  const fetchMaintenances = async () => {
    try {
      const res = await fetch('/api/system/maintenance')
      const data = await res.json()
      // Buscar todos
      const allRes = await fetch('/api/system/maintenance/list')
      if (allRes.ok) {
        const allData = await allRes.json()
        setMaintenances(allData.maintenance || [])
      }
    } catch (err) {
      console.error('Erro ao carregar avisos:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!formData.title.trim() || !formData.message.trim()) {
      alert('Título e mensagem são obrigatórios')
      return
    }

    try {
      const body = {
        title: formData.title,
        message: formData.message,
        severity: formData.severity,
        graceTimeUntil: formData.graceTimeUntil ? new Date(formData.graceTimeUntil).toISOString() : null,
      }

      const res = editingId
        ? await fetch(`/api/system/maintenance/${editingId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          })
        : await fetch('/api/system/maintenance', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          })

      if (!res.ok) {
        throw new Error('Erro ao salvar aviso')
      }

      setFormData({ title: '', message: '', severity: 'WARNING', graceTimeUntil: '' })
      setEditingId(null)
      setShowForm(false)
      await fetchMaintenances()
    } catch (err) {
      alert(`Erro: ${err}`)
    }
  }

  const handleEdit = (maintenance: Maintenance) => {
    setEditingId(maintenance.id)
    setFormData({
      title: maintenance.title,
      message: maintenance.message,
      severity: maintenance.severity,
      graceTimeUntil: maintenance.graceTimeUntil
        ? new Date(maintenance.graceTimeUntil).toISOString().slice(0, 16)
        : '',
    })
    setShowForm(true)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Tem certeza que deseja deletar este aviso?')) return

    try {
      const res = await fetch(`/api/system/maintenance/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Erro ao deletar')
      await fetchMaintenances()
    } catch (err) {
      alert(`Erro: ${err}`)
    }
  }

  const handleUpdateStatus = async (id: string, newStatus: 'DRAFT' | 'ACTIVE' | 'ARCHIVED') => {
    try {
      const res = await fetch(`/api/system/maintenance/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      if (!res.ok) throw new Error('Erro ao atualizar')
      await fetchMaintenances()
    } catch (err) {
      alert(`Erro: ${err}`)
    }
  }

  const severityIcons = {
    INFO: <Info className="w-4 h-4 text-blue-600" />,
    WARNING: <AlertCircle className="w-4 h-4 text-yellow-600" />,
    CRITICAL: <AlertTriangle className="w-4 h-4 text-red-600" />,
  }

  const activeMaintenance = maintenances.find((m) => m.status === 'ACTIVE')

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Avisos de Manutenção</h1>
            <p className="text-gray-600 mt-2">Gerencie mensagens de manutenção do sistema</p>
          </div>
          <button
            onClick={() => {
              setEditingId(null)
              setFormData({
                title: '',
                message: '',
                severity: 'WARNING',
                graceTimeUntil: '',
              })
              setShowForm(!showForm)
            }}
            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition"
          >
            <Plus className="w-5 h-5" />
            Novo Aviso
          </button>
        </div>

        {/* Status Ativo */}
        {activeMaintenance && (
          <div className="bg-red-50 border-2 border-red-200 rounded-lg p-4 mb-6">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-6 h-6 text-red-600 flex-shrink-0 mt-1" />
              <div>
                <p className="font-bold text-red-900">⚠️ Aviso Ativo no Momento</p>
                <p className="text-red-800 mt-1">{activeMaintenance.title}</p>
                <p className="text-sm text-red-700 mt-1">{activeMaintenance.message}</p>
                {activeMaintenance.graceTimeUntil && (
                  <p className="text-sm text-red-700 mt-2 flex items-center gap-1">
                    <Clock className="w-4 h-4" />
                    Grace Time:{' '}
                    {new Date(activeMaintenance.graceTimeUntil).toLocaleString('pt-BR')}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Form */}
        {showForm && (
          <div className="bg-white rounded-lg shadow-lg p-6 mb-8 border-l-4 border-blue-600">
            <h2 className="text-xl font-bold mb-4">
              {editingId ? 'Editar Aviso' : 'Novo Aviso'}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Título
                </label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="Ex: Manutenção Programada"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Mensagem
                </label>
                <textarea
                  value={formData.message}
                  onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                  placeholder="Descreva a manutenção..."
                  rows={4}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:border-transparent"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Severidade
                  </label>
                  <select
                    value={formData.severity}
                    onChange={(e) =>
                      setFormData({ ...formData, severity: e.target.value as any })
                    }
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:border-transparent"
                  >
                    <option value="INFO">ℹ️ Informação</option>
                    <option value="WARNING">⚠️ Aviso</option>
                    <option value="CRITICAL">🚨 Crítico</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Grace Time (Opcional)
                  </label>
                  <input
                    type="datetime-local"
                    value={formData.graceTimeUntil}
                    onChange={(e) =>
                      setFormData({ ...formData, graceTimeUntil: e.target.value })
                    }
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:border-transparent"
                  />
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  type="submit"
                  className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition font-medium"
                >
                  {editingId ? 'Atualizar' : 'Criar'} Aviso
                </button>
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition font-medium"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Lista */}
        {loading ? (
          <div className="text-center text-gray-600">Carregando...</div>
        ) : maintenances.length === 0 ? (
          <div className="text-center text-gray-600 py-12">Nenhum aviso criado ainda</div>
        ) : (
          <div className="space-y-4">
            {maintenances.map((m) => (
              <div
                key={m.id}
                className={`bg-white rounded-lg shadow p-6 border-l-4 ${
                  m.status === 'ACTIVE'
                    ? 'border-l-red-600'
                    : m.status === 'DRAFT'
                      ? 'border-l-yellow-600'
                      : 'border-l-gray-400'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      {severityIcons[m.severity]}
                      <h3 className="font-bold text-lg text-gray-900">{m.title}</h3>
                      <span
                        className={`text-xs px-2 py-1 rounded font-semibold ${
                          m.status === 'ACTIVE'
                            ? 'bg-red-100 text-red-800'
                            : m.status === 'DRAFT'
                              ? 'bg-yellow-100 text-yellow-800'
                              : 'bg-gray-100 text-gray-800'
                        }`}
                      >
                        {m.status}
                      </span>
                    </div>
                    <p className="text-gray-700 mb-3">{m.message}</p>
                    <div className="text-xs text-gray-500">
                      Por {m.createdByUser.name} em{' '}
                      {new Date(m.createdAt).toLocaleString('pt-BR')}
                      {m.graceTimeUntil && (
                        <div className="mt-2 flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          Grace Time:{' '}
                          {new Date(m.graceTimeUntil).toLocaleString('pt-BR')}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Ações */}
                  <div className="flex items-center gap-2 ml-4">
                    {m.status !== 'ACTIVE' && (
                      <button
                        onClick={() => handleUpdateStatus(m.id, 'ACTIVE')}
                        className="p-2 bg-green-100 text-green-700 rounded hover:bg-green-200 transition"
                        title="Ativar"
                      >
                        <Check className="w-4 h-4" />
                      </button>
                    )}

                    <button
                      onClick={() => handleEdit(m)}
                      className="p-2 bg-blue-100 text-blue-700 rounded hover:bg-blue-200 transition"
                      title="Editar"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>

                    <button
                      onClick={() => handleDelete(m.id)}
                      className="p-2 bg-red-100 text-red-700 rounded hover:bg-red-200 transition"
                      title="Deletar"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
