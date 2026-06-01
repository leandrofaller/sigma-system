'use client'

import { useState, useEffect, useCallback } from 'react'
import { Shield, Plus, X, Users, Search, RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react'
import { toast } from 'sonner'

interface Faccao {
  id: string
  nome: string
  sigla: string | null
  cor: string
  descricao: string | null
  ativa: boolean
  totalApenados: number
}

interface ApenadoResumo {
  id: string
  nome: string
  cpf: string | null
  unidade: string | null
  regime: string | null
  facaoNivel: string | null
}

interface AIPFaccoesPanelProps {
  userRole: string
}

// ─── Nova Facção Modal ────────────────────────────────────────────────────────
function NovaFaccaoModal({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated: (f: Faccao) => void
}) {
  const [nome, setNome] = useState('')
  const [sigla, setSigla] = useState('')
  const [cor, setCor] = useState('#ef4444')
  const [descricao, setDescricao] = useState('')
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!nome.trim()) return
    setSaving(true)
    try {
      const res = await fetch('/api/aip/faccoes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome, sigla, cor, descricao }),
      })
      if (!res.ok) {
        const err = await res.json()
        toast.error(err.error ?? 'Erro ao criar facção')
        return
      }
      const data = await res.json()
      toast.success(`Facção "${data.nome}" criada com sucesso`)
      onCreated(data)
      onClose()
    } catch {
      toast.error('Erro ao criar facção')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-xl max-w-md w-full border border-gray-200 dark:border-gray-700" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Nova Facção</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Nome <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex: PCC, CV, TCP..."
              required
              className="w-full px-3 py-2 text-sm bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:ring-2 focus:ring-red-500 focus:border-transparent"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Sigla</label>
              <input
                type="text"
                value={sigla}
                onChange={(e) => setSigla(e.target.value)}
                placeholder="Ex: PCC"
                maxLength={10}
                className="w-full px-3 py-2 text-sm bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:ring-2 focus:ring-red-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Cor</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={cor}
                  onChange={(e) => setCor(e.target.value)}
                  className="w-10 h-9 rounded border border-gray-300 dark:border-gray-600 cursor-pointer"
                />
                <span className="text-sm text-gray-500 dark:text-gray-400">{cor}</span>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Descrição</label>
            <textarea
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              rows={2}
              placeholder="Descrição opcional..."
              className="w-full px-3 py-2 text-sm bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:ring-2 focus:ring-red-500 focus:border-transparent resize-none"
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving || !nome.trim()}
              className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {saving ? 'Salvando...' : 'Criar Facção'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Apenados da Facção Modal ─────────────────────────────────────────────────
function ApenadosFaccaoModal({
  faccao,
  onClose,
}: {
  faccao: Faccao
  onClose: () => void
}) {
  const [apenados, setApenados] = useState<ApenadoResumo[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)

  const LIMIT = 15

  const fetch_ = useCallback(
    async (query: string, p: number) => {
      setLoading(true)
      try {
        const params = new URLSearchParams({
          facaoReal: faccao.nome,
          limit: String(LIMIT),
          page: String(p),
        })
        if (query) params.set('q', query)
        const res = await fetch(`/api/aip/apenados?${params}`)
        if (res.ok) {
          const data = await res.json()
          setApenados(data.apenados ?? [])
          setTotal(data.total ?? 0)
        }
      } finally {
        setLoading(false)
      }
    },
    [faccao.nome]
  )

  useEffect(() => { fetch_(q, page) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSearch = (v: string) => {
    setQ(v)
    setPage(1)
    fetch_(v, 1)
  }

  const totalPages = Math.ceil(total / LIMIT)

  const nivelLabel: Record<string, string> = {
    confirmado: 'Confirmado',
    provavel: 'Provável',
    suspeita: 'Suspeita',
    improvavel: 'Improvável',
    negado: 'Negado',
  }
  const nivelCor: Record<string, string> = {
    confirmado: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300',
    provavel: 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300',
    suspeita: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300',
    improvavel: 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300',
    negado: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-xl max-w-2xl w-full max-h-[85vh] flex flex-col border border-gray-200 dark:border-gray-700" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="sticky top-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center gap-3 shrink-0">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: faccao.cor }}>
            <span className="text-white text-xs font-bold">{faccao.sigla?.slice(0, 3) ?? faccao.nome.slice(0, 2).toUpperCase()}</span>
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{faccao.nome}</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">{total} apenado{total !== 1 ? 's' : ''} no AIP</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search */}
        <div className="px-6 py-3 border-b border-gray-200 dark:border-gray-700 shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            <input
              type="text"
              placeholder="Buscar por nome ou CPF..."
              value={q}
              onChange={(e) => handleSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-red-500 focus:border-transparent"
            />
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto px-6 py-3">
          {loading ? (
            <div className="flex items-center justify-center h-32 gap-2 text-gray-400">
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span className="text-sm">Carregando...</span>
            </div>
          ) : apenados.length === 0 ? (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400 text-sm">Nenhum apenado encontrado</div>
          ) : (
            <div className="space-y-2">
              {apenados.map((a) => (
                <div key={a.id} className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                  <Users className="w-4 h-4 text-gray-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{a.nome}</p>
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {a.cpf && <span className="text-xs text-gray-500 dark:text-gray-400">{a.cpf}</span>}
                      {a.unidade && <span className="text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-1.5 py-0.5 rounded">{a.unidade}</span>}
                      {a.regime && <span className="text-xs bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 px-1.5 py-0.5 rounded">{a.regime}</span>}
                      {a.facaoNivel && (
                        <span className={`text-xs px-1.5 py-0.5 rounded ${nivelCor[a.facaoNivel] ?? 'bg-gray-100 text-gray-600'}`}>
                          {nivelLabel[a.facaoNivel] ?? a.facaoNivel}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-6 py-3 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between shrink-0">
            <button
              onClick={() => { const p = Math.max(1, page - 1); setPage(p); fetch_(q, p) }}
              disabled={page === 1}
              className="flex items-center gap-1 px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="w-4 h-4" /> Anterior
            </button>
            <span className="text-sm text-gray-600 dark:text-gray-400">Página {page} de {totalPages}</span>
            <button
              onClick={() => { const p = Math.min(totalPages, page + 1); setPage(p); fetch_(q, p) }}
              disabled={page === totalPages}
              className="flex items-center gap-1 px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Próxima <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Main Panel ───────────────────────────────────────────────────────────────
export function AIPFaccoesPanel({ userRole }: AIPFaccoesPanelProps) {
  const [faccoes, setFaccoes] = useState<Faccao[]>([])
  const [loading, setLoading] = useState(true)
  const [showNova, setShowNova] = useState(false)
  const [selected, setSelected] = useState<Faccao | null>(null)

  const canCreate = userRole === 'SUPER_ADMIN' || userRole === 'OPERATOR'

  const fetchFaccoes = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/aip/faccoes')
      if (res.ok) {
        const data = await res.json()
        setFaccoes(data.faccoes ?? [])
      } else {
        toast.error('Erro ao carregar facções')
      }
    } catch {
      toast.error('Erro ao carregar facções')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchFaccoes() }, [fetchFaccoes])

  const handleCreated = (f: Faccao) => {
    setFaccoes((prev) => [...prev, f].sort((a, b) => a.nome.localeCompare(b.nome)))
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-40 gap-2 text-gray-400">
        <RefreshCw className="w-4 h-4 animate-spin" />
        <span className="text-sm">Carregando facções...</span>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {faccoes.length} facç{faccoes.length !== 1 ? 'ões' : 'ão'} cadastrada{faccoes.length !== 1 ? 's' : ''}
        </p>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchFaccoes}
            disabled={loading}
            className="p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            title="Atualizar"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          {canCreate && (
            <button
              onClick={() => setShowNova(true)}
              className="flex items-center gap-2 px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
            >
              <Plus className="w-4 h-4" /> Nova Facção
            </button>
          )}
        </div>
      </div>

      {/* Grid */}
      {faccoes.length === 0 ? (
        <div className="text-center py-16 text-gray-500 dark:text-gray-400">
          <Shield className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Nenhuma facção cadastrada.</p>
          {canCreate && (
            <p className="text-xs mt-1">Clique em "Nova Facção" para começar.</p>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {faccoes.map((f) => (
            <button
              key={f.id}
              onClick={() => f.totalApenados > 0 ? setSelected(f) : undefined}
              className={`text-left bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 transition-all ${
                f.totalApenados > 0
                  ? 'hover:shadow-md hover:border-red-300 dark:hover:border-red-600 cursor-pointer'
                  : 'cursor-default opacity-80'
              }`}
            >
              <div className="flex items-start gap-3">
                {/* Badge colorido */}
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                  style={{ backgroundColor: f.cor }}
                >
                  <span className="text-white text-xs font-bold leading-none">
                    {f.sigla?.slice(0, 3) ?? f.nome.slice(0, 2).toUpperCase()}
                  </span>
                </div>

                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900 dark:text-white truncate">{f.nome}</p>
                  {f.sigla && <p className="text-xs text-gray-500 dark:text-gray-400">{f.sigla}</p>}
                  {f.descricao && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 truncate">{f.descricao}</p>
                  )}
                  <div className="flex items-center gap-1.5 mt-2 text-sm">
                    <Users className="w-3.5 h-3.5 text-gray-400" />
                    <span className={f.totalApenados > 0 ? 'text-red-600 dark:text-red-400 font-medium' : 'text-gray-400 dark:text-gray-500'}>
                      {f.totalApenados} apenado{f.totalApenados !== 1 ? 's' : ''} no AIP
                    </span>
                  </div>
                  {!f.ativa && (
                    <span className="inline-block mt-1 text-xs bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 px-1.5 py-0.5 rounded">
                      Inativa
                    </span>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Modais */}
      {showNova && (
        <NovaFaccaoModal onClose={() => setShowNova(false)} onCreated={handleCreated} />
      )}
      {selected && (
        <ApenadosFaccaoModal faccao={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  )
}
