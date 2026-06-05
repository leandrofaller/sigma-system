'use client'

import { useState, useEffect, useCallback } from 'react'
import { Shield, Plus, Users, X, ChevronLeft, ChevronRight, Search, Loader2, User } from 'lucide-react'
import { toast } from 'sonner'
import { ApenadoModal, ApenadoFoto, ApenadoImportado } from './ApenadosImportados'

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

function FaccaoCard({ faccao, onSelect }: { faccao: Faccao; onSelect: (f: Faccao) => void }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(faccao)}
      className="w-full text-left bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 hover:shadow-md hover:border-gray-300 dark:hover:border-gray-600 transition-all"
    >
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
        <div className="shrink-0 flex flex-col items-end gap-1">
          {!faccao.ativa && (
            <span className="px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-500 text-xs rounded-full">Inativa</span>
          )}
          {faccao._count != null && faccao._count.apenados > 0 && (
            <span className="text-xs text-gray-400">Ver lista →</span>
          )}
        </div>
      </div>
    </button>
  )
}

// ── Modal de apenados por facção ──────────────────────────────

function ApenadosFaccaoModal({ faccao, onClose }: { faccao: Faccao; onClose: () => void }) {
  const [apenados, setApenados] = useState<ApenadoImportado[]>([])
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [page, setPage] = useState(1)
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(false)
  const [selectedApenado, setSelectedApenado] = useState<ApenadoImportado | null>(null)
  const LIMIT = 15

  const fetchApenados = useCallback(async (p: number, query: string) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ faccaoId: faccao.id, page: String(p), limit: String(LIMIT) })
      if (query) params.set('q', query)
      const res = await fetch(`/api/sipe/apenados?${params}`)
      if (res.ok) {
        const data = await res.json()
        setApenados(data.apenados)
        setTotal(data.total)
        setTotalPages(data.totalPages)
      }
    } finally {
      setLoading(false)
    }
  }, [faccao.id])

  useEffect(() => {
    fetchApenados(1, '')
  }, [fetchApenados])

  const handleSearch = (value: string) => {
    setQ(value)
    setPage(1)
    fetchApenados(1, value)
  }

  const handlePage = (p: number) => {
    setPage(p)
    fetchApenados(p, q)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 p-5 border-b border-gray-200 dark:border-gray-700 shrink-0">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-sm shrink-0"
            style={{ backgroundColor: faccao.cor || '#ef4444' }}
          >
            {faccao.sigla || faccao.nome.substring(0, 2).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-bold text-gray-900 dark:text-white truncate">{faccao.nome}</h2>
            <p className="text-xs text-gray-500">{total} apenado{total !== 1 ? 's' : ''} vinculado{total !== 1 ? 's' : ''}</p>
          </div>
          <button 
            onClick={onClose} 
            className="p-2 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-xl transition-colors text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300 shrink-0"
            title="Fechar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search */}
        <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-800 shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar por nome, CPF ou alcunha..."
              value={q}
              onChange={e => handleSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white focus:ring-2 focus:ring-red-500 focus:border-transparent"
            />
          </div>
        </div>

        {/* Lista */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center h-40 text-gray-400">
              <Loader2 className="w-5 h-5 animate-spin mr-2" /> Carregando...
            </div>
          ) : apenados.length === 0 ? (
            <div className="flex items-center justify-center h-40 text-gray-400 text-sm">
              Nenhum apenado encontrado
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-800 sticky top-0">
                <tr>
                  <th className="text-left px-5 py-2.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Nome</th>
                  <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider hidden sm:table-cell">CPF</th>
                  <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider hidden md:table-cell">Regime</th>
                  <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Situação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {apenados.map(a => (
                  <tr 
                    key={a.id} 
                    onClick={() => setSelectedApenado(a)}
                    className="hover:bg-gray-50 dark:hover:bg-gray-850/50 cursor-pointer transition-colors"
                  >
                    <td className="px-5 py-2">
                      <div className="flex items-center gap-3">
                        {/* Foto do Apenado */}
                        <ApenadoFoto
                          id={a.id}
                          nome={a.nome}
                          photoPath={a.photoPath || a.apenado?.photoPath}
                          className="w-9 h-11 rounded"
                        />
                        {/* Nome e Data */}
                        <div className="min-w-0">
                          <p className="font-semibold text-gray-950 dark:text-white text-xs truncate max-w-[280px] sm:max-w-[340px]">{a.nome}</p>
                          {a.dataNascimento && (
                            <p className="text-[10px] text-gray-400 mt-0.5 font-medium">Nasc: {a.dataNascimento}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-gray-500 font-mono text-xs hidden sm:table-cell">{a.cpf || '—'}</td>
                    <td className="px-3 py-3 text-gray-500 text-xs hidden md:table-cell">{a.regime || '—'}</td>
                    <td className="px-3 py-3">
                      {a.situacao ? (
                        <span className="px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 text-xs rounded-full">
                          {a.situacao}
                        </span>
                      ) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Paginação */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100 dark:border-gray-800 shrink-0">
            <p className="text-xs text-gray-500">
              Página {page} de {totalPages} · {total} registros
            </p>
            <div className="flex gap-1">
              <button
                onClick={() => handlePage(page - 1)}
                disabled={page <= 1}
                className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-30 text-gray-600 dark:text-gray-400"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => handlePage(page + 1)}
                disabled={page >= totalPages}
                className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-30 text-gray-600 dark:text-gray-400"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {selectedApenado && (
        <ApenadoModal 
          apenado={selectedApenado} 
          onClose={() => setSelectedApenado(null)} 
        />
      )}
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
          <button 
            onClick={onClose} 
            className="p-2 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-xl transition-colors text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300"
            title="Fechar"
          >
            ✕
          </button>
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
  const [selectedFaccao, setSelectedFaccao] = useState<Faccao | null>(null)

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
          {faccoes.map(f => (
            <FaccaoCard
              key={f.id}
              faccao={f}
              onSelect={(f) => f._count && f._count.apenados > 0 ? setSelectedFaccao(f) : toast.info('Nenhum apenado vinculado a esta facção')}
            />
          ))}
        </div>
      )}

      {showModal && (
        <NovaFaccaoModal onClose={() => setShowModal(false)} onCreated={fetchFaccoes} />
      )}

      {selectedFaccao && (
        <ApenadosFaccaoModal faccao={selectedFaccao} onClose={() => setSelectedFaccao(null)} />
      )}
    </div>
  )
}
