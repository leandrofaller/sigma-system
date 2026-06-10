'use client'

import { useState, useEffect, useCallback } from 'react'
import { Search, Briefcase, X, Users, RefreshCw, ChevronLeft, ChevronRight, MapPin, Shield } from 'lucide-react'
import { toast } from 'sonner'

interface Cliente {
  id: string
  nome: string
  unidade: string | null
  regime: string | null
}

interface Advogado {
  id: string
  sipeId: number
  nome: string
  oab: string | null
  cpf: string | null
  telefone: string | null
  totalClientes: number
  clientes: Cliente[]
}

function AvatarAdvogado({ nome }: { nome: string }) {
  const iniciais = nome
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase()

  return (
    <div className="w-14 h-14 rounded-full bg-blue-600 flex items-center justify-center shrink-0">
      <span className="text-white font-bold text-lg">{iniciais}</span>
    </div>
  )
}

export function AIPAdvogadosPanel() {
  const [advogados, setAdvogados] = useState<Advogado[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [filtered, setFiltered] = useState<Advogado[]>([])
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<Advogado | null>(null)

  const LIMIT = 20

  const fetchAdvogados = useCallback(async (q = '') => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (q) params.set('q', q)
      const res = await fetch(`/api/aip/advogados?${params}`)
      if (!res.ok) throw new Error()
      const data = await res.json()
      setAdvogados(data.advogados ?? [])
    } catch {
      toast.error('Erro ao carregar advogados')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchAdvogados() }, [fetchAdvogados])

  useEffect(() => {
    if (!searchQuery.trim()) {
      setFiltered(advogados)
    } else {
      const lower = searchQuery.toLowerCase()
      setFiltered(
        advogados.filter(
          (a) =>
            a.nome.toLowerCase().includes(lower) ||
            a.oab?.toLowerCase().includes(lower) ||
            a.cpf?.includes(searchQuery)
        )
      )
    }
    setPage(1)
  }, [searchQuery, advogados])

  const totalPages = Math.ceil(filtered.length / LIMIT)
  const paginated = filtered.slice((page - 1) * LIMIT, page * LIMIT)

  if (loading) {
    return (
      <div className="flex items-center justify-center h-40 gap-2 text-gray-400">
        <RefreshCw className="w-4 h-4 animate-spin" />
        <span className="text-sm">Carregando advogados...</span>
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
            placeholder="Buscar por nome, OAB ou CPF..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
        <button
          onClick={() => fetchAdvogados(searchQuery)}
          disabled={loading}
          className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Count */}
      <p className="text-sm text-gray-500 dark:text-gray-400">
        {filtered.length} advogado{filtered.length !== 1 ? 's' : ''} vinculado{filtered.length !== 1 ? 's' : ''} a apenados do AIP
      </p>

      {/* Cards */}
      {paginated.length === 0 ? (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">
          {advogados.length === 0 ? 'Nenhum advogado vinculado' : 'Nenhum resultado encontrado'}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {paginated.map((adv) => (
            <button
              key={adv.id}
              onClick={() => setSelected(adv)}
              className="text-left bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 hover:shadow-md hover:border-blue-300 dark:hover:border-blue-600 transition-all"
            >
              <div className="flex items-start gap-3">
                <AvatarAdvogado nome={adv.nome} />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900 dark:text-white truncate">{adv.nome}</p>
                  {adv.oab && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">OAB: {adv.oab}</p>
                  )}
                  {adv.cpf && (
                    <p className="text-xs text-gray-500 dark:text-gray-400">CPF: {adv.cpf}</p>
                  )}
                  <div className="flex items-center gap-1.5 mt-2 text-sm text-blue-600 dark:text-blue-400">
                    <Users className="w-3.5 h-3.5" />
                    <span>{adv.totalClientes} cliente{adv.totalClientes !== 1 ? 's' : ''} no AIP</span>
                  </div>
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
            className="bg-white dark:bg-gray-800 rounded-xl max-w-2xl w-full max-h-[85vh] overflow-y-auto border border-gray-200 dark:border-gray-700"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="sticky top-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center gap-4">
              <AvatarAdvogado nome={selected.nome} />
              <div className="flex-1">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{selected.nome}</h2>
                {selected.oab && <p className="text-sm text-gray-500 dark:text-gray-400">OAB: {selected.oab}</p>}
              </div>
              <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="px-6 py-4 space-y-6">
              {/* Dados */}
              <section>
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                  <Briefcase className="w-4 h-4" /> Dados do Advogado
                </h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  {selected.oab && (
                    <div>
                      <p className="text-gray-500 dark:text-gray-400">OAB</p>
                      <p className="font-medium text-gray-900 dark:text-white">{selected.oab}</p>
                    </div>
                  )}
                  {selected.cpf && (
                    <div>
                      <p className="text-gray-500 dark:text-gray-400">CPF</p>
                      <p className="font-medium text-gray-900 dark:text-white">{selected.cpf}</p>
                    </div>
                  )}
                  {selected.telefone && (
                    <div>
                      <p className="text-gray-500 dark:text-gray-400">Telefone</p>
                      <p className="font-medium text-gray-900 dark:text-white">{selected.telefone}</p>
                    </div>
                  )}
                </div>
              </section>

              {/* Clientes AIP */}
              <section>
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                  <Shield className="w-4 h-4" /> Clientes no AIP ({selected.totalClientes})
                </h3>
                <div className="space-y-2">
                  {selected.clientes.map((c) => (
                    <div key={c.id} className="flex items-start gap-3 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                      <Users className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{c.nome}</p>
                        <div className="flex flex-wrap gap-2 mt-1">
                          {c.unidade && (
                            <span className="inline-flex items-center gap-1 text-xs text-blue-700 dark:text-blue-300 bg-blue-100 dark:bg-blue-900/30 px-2 py-0.5 rounded">
                              <MapPin className="w-3 h-3" /> {c.unidade}
                            </span>
                          )}
                          {c.regime && (
                            <span className="text-xs text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-900/30 px-2 py-0.5 rounded">
                              {c.regime}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
