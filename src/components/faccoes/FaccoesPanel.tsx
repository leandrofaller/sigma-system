'use client'

import { useState, useEffect } from 'react'
import { Shield, Plus, Users } from 'lucide-react'
import { toast } from 'sonner'

interface Faccao {
  id: string
  sipeId: number
  nome: string
  sigla: string | null
  cor: string
  descricao: string | null
  ativa: boolean
  _count?: { apenados: number }
}

function FaccaoCard({ faccao }: { faccao: Faccao }) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 hover:shadow-md transition-shadow">
      <div className="flex items-start gap-4">
        <div
          className="w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold text-lg shrink-0"
          style={{ backgroundColor: faccao.cor || '#ef4444' }}
        >
          {faccao.sigla || faccao.nome.substring(0, 2).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-gray-900 dark:text-white">{faccao.nome}</h3>
          {faccao.sigla && <p className="text-xs text-gray-500 mt-0.5">Sigla: {faccao.sigla}</p>}
          {faccao.descricao && (
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 line-clamp-2">{faccao.descricao}</p>
          )}
          {faccao._count != null && (
            <div className="mt-2 flex items-center gap-1 text-sm text-gray-500">
              <Users className="w-3.5 h-3.5" />
              <span>{faccao._count.apenados} apenado{faccao._count.apenados !== 1 ? 's' : ''} vinculado{faccao._count.apenados !== 1 ? 's' : ''}</span>
            </div>
          )}
        </div>
        <div className="shrink-0">
          {!faccao.ativa && (
            <span className="px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-500 text-xs rounded-full">Inativa</span>
          )}
        </div>
      </div>
    </div>
  )
}

function NovaFaccaoModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({ nome: '', sigla: '', cor: '#ef4444', descricao: '' })
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.nome) return
    setLoading(true)
    const res = await fetch('/api/sipe/faccoes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    if (res.ok) {
      toast.success('Facção criada com sucesso')
      onCreated()
      onClose()
    } else {
      toast.error('Erro ao criar facção')
    }
    setLoading(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">Nova Facção</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-gray-500">✕</button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nome *</label>
            <input
              type="text"
              value={form.nome}
              onChange={e => setForm(f => ({ ...f, nome: e.target.value }))}
              required
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-red-500 focus:border-transparent"
              placeholder="Ex: Primeiro Comando da Capital"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Sigla</label>
              <input
                type="text"
                value={form.sigla}
                onChange={e => setForm(f => ({ ...f, sigla: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                placeholder="Ex: PCC"
                maxLength={10}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Cor</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={form.cor}
                  onChange={e => setForm(f => ({ ...f, cor: e.target.value }))}
                  className="w-10 h-10 rounded-lg border border-gray-300 dark:border-gray-600 cursor-pointer"
                />
                <span className="text-sm text-gray-500 font-mono">{form.cor}</span>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Descrição</label>
            <textarea
              value={form.descricao}
              onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))}
              rows={3}
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white resize-none"
              placeholder="Informações relevantes sobre a facção..."
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 text-sm bg-red-600 hover:bg-red-700 disabled:bg-gray-400 text-white rounded-lg font-medium transition-colors"
            >
              {loading ? 'Salvando...' : 'Criar Facção'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export function FaccoesPanel() {
  const [faccoes, setFaccoes] = useState<Faccao[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)

  const fetchFaccoes = async () => {
    setLoading(true)
    const res = await fetch('/api/sipe/faccoes?withCount=true')
    if (res.ok) setFaccoes(await res.json())
    setLoading(false)
  }

  useEffect(() => { fetchFaccoes() }, [])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">{faccoes.length} facção{faccoes.length !== 1 ? 'ões' : ''} cadastrada{faccoes.length !== 1 ? 's' : ''}</p>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-colors"
        >
          <Plus className="w-4 h-4" /> Nova Facção
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40 text-gray-400">Carregando...</div>
      ) : faccoes.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-40 text-gray-400 gap-2">
          <Shield className="w-8 h-8 opacity-30" />
          <p className="text-sm">Nenhuma facção cadastrada</p>
          <p className="text-xs">Use &quot;Importar Facções do SIPE&quot; ou crie manualmente</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {faccoes.map(f => <FaccaoCard key={f.id} faccao={f} />)}
        </div>
      )}

      {showModal && (
        <NovaFaccaoModal onClose={() => setShowModal(false)} onCreated={fetchFaccoes} />
      )}
    </div>
  )
}
