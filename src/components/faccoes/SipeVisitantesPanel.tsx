'use client'

import { useState, useEffect, useCallback } from 'react'
import { Search, User, X, RefreshCw, ChevronLeft, ChevronRight, Shield } from 'lucide-react'
import { toast } from 'sonner'

interface Visitante {
  id: string
  visitanteId: string | null
  nomeVisitante: string | null
  cpfVisitante: string | null
  parentescoVisitante: string | null
  ativoVisitante: boolean | null
  photoPath: string | null
  descricao: string | null
  apenado: { id: string; nome: string; photoPath?: string | null }
}

function FotoVisitante({ visitanteId, nome }: { visitanteId: string | null; nome: string | null }) {
  const [erro, setErro] = useState(false)
  const iniciais = (nome ?? '?')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase()

  if (!visitanteId || erro) {
    return (
      <div className="w-14 h-14 rounded-full bg-blue-600 flex items-center justify-center shrink-0 text-white font-bold text-lg">
        {iniciais}
      </div>
    )
  }

  return (
    <img
      src={`/api/sipe/visitantes/${visitanteId}/foto`}
      alt={nome ?? 'Visitante'}
      className="w-14 h-14 rounded-full object-cover shrink-0 bg-gray-100 dark:bg-gray-700"
      onError={() => setErro(true)}
    />
  )
}

export function SipeVisitantesPanel() {
  const [visitantes, setVisitantes] = useState<Visitante[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [filtered, setFiltered] = useState<Visitante[]>([])
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<Visitante | null>(null)

  const LIMIT = 20

  const fetchVisitantes = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/sipe/visitantes')
      if (!res.ok) throw new Error()
      const data = await res.json()
      setVisitantes(data.visitantes ?? [])
    } catch {
      toast.error('Erro ao carregar visitantes')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchVisitantes()
  }, [fetchVisitantes])

  useEffect(() => {
    if (!searchQuery.trim()) {
      setFiltered(visitantes)
    } else {
      const lower = searchQuery.toLowerCase()
      setFiltered(
        visitantes.filter(
          (v) =>
            v.nomeVisitante?.toLowerCase().includes(lower) ||
            v.cpfVisitante?.includes(searchQuery)
        )
      )
    }
    setPage(1)
  }, [searchQuery, visitantes])

  const totalPages = Math.ceil(filtered.length / LIMIT)
  const paginated = filtered.slice((page - 1) * LIMIT, page * LIMIT)

  if (loading) {
    return (
      <div className="flex items-center justify-center h-40 gap-2 text-gray-400">
        <RefreshCw className="w-4 h-4 animate-spin" />
        <span className="text-sm">Carregando visitantes...</span>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Search + Refresh */}
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Buscar por nome ou CPF..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
        <button
          onClick={fetchVisitantes}
          disabled={loading}
          className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Count */}
      <p className="text-sm text-gray-500 dark:text-gray-400">
        {filtered.length} registro{filtered.length !== 1 ? 's' : ''} de visitantes vinculados a apenados do SIPE
      </p>

      {/* Cards */}
      {paginated.length === 0 ? (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">
          {visitantes.length === 0 ? 'Nenhum visitante cadastrado' : 'Nenhum resultado encontrado'}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {paginated.map((v) => (
            <button
              key={v.id}
              onClick={() => setSelected(v)}
              className="text-left bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 hover:shadow-md hover:border-blue-300 dark:hover:border-blue-600 transition-all"
            >
              <div className="flex items-start gap-3">
                <FotoVisitante visitanteId={v.visitanteId} nome={v.nomeVisitante} />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900 dark:text-white truncate">
                    {v.nomeVisitante ?? 'Visitante sem nome'}
                  </p>
                  {v.cpfVisitante && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">CPF: {v.cpfVisitante}</p>
                  )}
                  {v.parentescoVisitante && (
                    <span className="inline-block mt-1 text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded">
                      {v.parentescoVisitante}
                    </span>
                  )}
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-2 truncate">
                    Apenado: {v.apenado.nome}
                  </p>
                  {v.ativoVisitante === false && (
                    <span className="inline-block mt-1 text-xs bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 px-2 py-0.5 rounded">
                      Inativo
                    </span>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="flex items-center gap-1 px-3 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronLeft className="w-4 h-4" /> Anterior
          </button>
          <span className="text-sm text-gray-600 dark:text-gray-400">
            Página {page} de {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="flex items-center gap-1 px-3 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Próxima <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Modal */}
      {selected && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
          onClick={() => setSelected(null)}
        >
          <div
            className="bg-white dark:bg-gray-800 rounded-xl max-w-lg w-full max-h-[85vh] overflow-y-auto border border-gray-200 dark:border-gray-700"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="sticky top-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center gap-4">
              <FotoVisitante visitanteId={selected.visitanteId} nome={selected.nomeVisitante} />
              <div className="flex-1">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                  {selected.nomeVisitante ?? 'Visitante sem nome'}
                </h2>
                {selected.parentescoVisitante && (
                  <p className="text-sm text-blue-600 dark:text-blue-400">{selected.parentescoVisitante}</p>
                )}
              </div>
              <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="px-6 py-4 space-y-6">
              {/* Dados Pessoais */}
              <section>
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                  <User className="w-4 h-4" /> Dados do Visitante
                </h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  {selected.cpfVisitante && (
                    <div>
                      <p className="text-gray-500 dark:text-gray-400">CPF</p>
                      <p className="font-medium text-gray-900 dark:text-white">{selected.cpfVisitante}</p>
                    </div>
                  )}
                  {selected.parentescoVisitante && (
                    <div>
                      <p className="text-gray-500 dark:text-gray-400">Parentesco</p>
                      <p className="font-medium text-gray-900 dark:text-white">{selected.parentescoVisitante}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-gray-500 dark:text-gray-400">Status</p>
                    <p className={`font-medium ${selected.ativoVisitante === false ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
                      {selected.ativoVisitante === false ? 'Inativo' : 'Ativo'}
                    </p>
                  </div>
                </div>
              </section>

              {/* Apenado Vinculado */}
              <section>
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                  <Shield className="w-4 h-4" /> Apenado Vinculado (SIPE)
                </h3>
                <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                  {selected.apenado.photoPath ? (
                    <img
                      src={`/api/sipe/apenados/${selected.apenado.id}/foto`}
                      alt={selected.apenado.nome}
                      className="w-10 h-10 rounded-lg object-cover shrink-0"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none'
                      }}
                    />
                  ) : null}
                  <div
                    className="w-10 h-10 rounded-lg bg-gray-300 dark:bg-gray-600 flex items-center justify-center shrink-0"
                    style={{ display: selected.apenado.photoPath ? 'none' : 'flex' }}
                  >
                    <span className="text-xs font-bold text-white">
                      {selected.apenado.nome.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">{selected.apenado.nome}</p>
                </div>
              </section>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
