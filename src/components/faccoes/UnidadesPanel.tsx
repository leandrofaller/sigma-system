'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Search, ChevronLeft, ChevronRight, Shield, Building2, Users, Loader2, X } from 'lucide-react'
import { ApenadoCard, ApenadoModal } from './ApenadosImportados'
import type { ApenadoImportado } from './ApenadosImportados'
import { toast } from 'sonner'

interface Unidade {
  id: string
  nome: string
  _count?: { apenados: number }
}

// ── Card de Unidade ──────────────────────────────

function UnidadeCard({ unidade, onSelect }: { unidade: Unidade; onSelect: (u: Unidade) => void }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(unidade)}
      className="w-full text-left bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 hover:shadow-md hover:border-gray-300 dark:hover:border-gray-600 transition-all"
    >
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 font-bold text-lg shrink-0">
          <Building2 className="w-6 h-6" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-gray-900 dark:text-white">{unidade.nome}</h3>
          {unidade._count != null && (
            <div className="mt-2 flex items-center gap-1 text-sm text-gray-500">
              <Users className="w-3.5 h-3.5" />
              <span>{unidade._count.apenados} apenado{unidade._count.apenados !== 1 ? 's' : ''}</span>
            </div>
          )}
        </div>
        <div className="shrink-0 text-right">
          {unidade._count != null && unidade._count.apenados > 0 && (
            <span className="text-xs text-gray-400">Ver lista →</span>
          )}
        </div>
      </div>
    </button>
  )
}

// ── Modal de Apenados por Unidade ──────────────────────────────

function ApenadosUnidadeModal({ unidade, onClose }: { unidade: Unidade; onClose: () => void }) {
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
      const params = new URLSearchParams({
        unidade: unidade.nome,
        page: String(p),
        limit: String(LIMIT)
      })
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
  }, [unidade.nome])

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
          <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 shrink-0">
            <Building2 className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-bold text-gray-900 dark:text-white truncate">{unidade.nome}</h2>
            <p className="text-xs text-gray-500">{total} apenado{total !== 1 ? 's' : ''}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg text-gray-500 shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search */}
        <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-800 shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar por nome, CPF ou matrícula..."
              value={q}
              onChange={e => handleSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
                    className="hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer"
                    onClick={() => setSelectedApenado(a)}
                  >
                    <td className="px-5 py-3">
                      <p className="font-medium text-gray-900 dark:text-white">{a.nome}</p>
                      {a.dataNascimento && (
                        <p className="text-xs text-gray-400">Nasc: {a.dataNascimento}</p>
                      )}
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
        <ApenadoModal apenado={selectedApenado} onClose={() => setSelectedApenado(null)} />
      )}
    </div>
  )
}

// ── Main Panel ──────────────────────────────

export function UnidadesPanel() {
  const [unidades, setUnidades] = useState<Unidade[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedUnidade, setSelectedUnidade] = useState<Unidade | null>(null)

  const fetchUnidades = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/sipe/unidades?withCount=true')
      if (res.ok) {
        const data = await res.json()
        setUnidades(data.unidades || [])
      }
    } catch (err) {
      console.error('Erro ao buscar unidades:', err)
      toast.error('Erro ao carregar unidades')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchUnidades() }, [])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">{unidades.length} unidade{unidades.length !== 1 ? 's' : ''} prisional{unidades.length !== 1 ? 'is' : ''}</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40 text-gray-400">Carregando...</div>
      ) : unidades.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-40 text-gray-400 gap-2">
          <Building2 className="w-8 h-8 opacity-30" />
          <p className="text-sm">Nenhuma unidade importada do SIPE</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {unidades.map(u => (
            <UnidadeCard
              key={u.id}
              unidade={u}
              onSelect={(u) => u._count && u._count.apenados > 0 ? setSelectedUnidade(u) : toast.info('Nenhum apenado vinculado a esta unidade')}
            />
          ))}
        </div>
      )}

      {selectedUnidade && (
        <ApenadosUnidadeModal unidade={selectedUnidade} onClose={() => setSelectedUnidade(null)} />
      )}
    </div>
  )
}
