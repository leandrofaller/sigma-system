'use client'

import { useState, useEffect, useCallback } from 'react'
import { Search, ChevronLeft, ChevronRight, Briefcase, Users, Phone, Shield } from 'lucide-react'

interface Faccao { nome: string; sigla: string | null; cor: string }
interface Alcunha { alcunha: string }
interface ApenadoResumido {
  id: string
  nome: string
  cpf: string | null
  regime: string | null
  unidade: string | null
  faccao: Faccao | null
  alcunhas: Alcunha[]
}
interface VinculoApenado { apenado: ApenadoResumido }
interface Advogado {
  id: string
  sipeId: number
  nome: string
  oab: string | null
  cpf: string | null
  telefone: string | null
  dataCadastro: string | null
  vinculos: VinculoApenado[]
}

function AdvogadoCard({ advogado, onClick }: { advogado: Advogado; onClick: () => void }) {
  const faccoesDosClientes = [...new Map(
    advogado.vinculos
      .filter(v => v.apenado.faccao)
      .map(v => [v.apenado.faccao!.nome, v.apenado.faccao!])
  ).values()]

  return (
    <div
      onClick={onClick}
      className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 hover:border-blue-300 dark:hover:border-blue-700 hover:shadow-md transition-all cursor-pointer"
    >
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-xl flex items-center justify-center shrink-0">
          <Briefcase className="w-5 h-5 text-blue-600 dark:text-blue-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-900 dark:text-white text-sm truncate">{advogado.nome}</p>
          <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-500">
            {advogado.oab && <span>OAB {advogado.oab}</span>}
            {advogado.telefone && (
              <span className="flex items-center gap-1">
                <Phone className="w-3 h-3" />{advogado.telefone}
              </span>
            )}
          </div>
          <div className="mt-2 flex items-center gap-2 flex-wrap">
            <span className="flex items-center gap-1 text-xs text-gray-500">
              <Users className="w-3 h-3" />
              {advogado.vinculos.length} cliente{advogado.vinculos.length !== 1 ? 's' : ''}
            </span>
            {faccoesDosClientes.map(f => (
              <span
                key={f.nome}
                className="px-1.5 py-0.5 rounded text-xs font-semibold text-white"
                style={{ backgroundColor: f.cor || '#ef4444' }}
              >
                {f.sigla || f.nome}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function AdvogadoModal({ advogado, onClose }: { advogado: Advogado; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-xl flex items-center justify-center">
                <Briefcase className="w-6 h-6 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-gray-900 dark:text-white">{advogado.nome}</h2>
                <div className="flex items-center gap-3 text-sm text-gray-500">
                  {advogado.oab && <span>OAB {advogado.oab}</span>}
                  {advogado.cpf && <span>CPF {advogado.cpf}</span>}
                </div>
              </div>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors text-gray-500">✕</button>
          </div>
        </div>

        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2">
              <Users className="w-4 h-4" />
              Clientes ({advogado.vinculos.length})
            </h3>
          </div>

          {advogado.vinculos.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">Nenhum cliente vinculado</p>
          ) : (
            <div className="space-y-2">
              {advogado.vinculos.map(v => (
                <div key={v.apenado.id} className="flex items-center gap-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{v.apenado.nome}</p>
                    {v.apenado.alcunhas.length > 0 && (
                      <p className="text-xs text-gray-500">{v.apenado.alcunhas.map(a => `"${a.alcunha}"`).join(', ')}</p>
                    )}
                    <div className="flex items-center gap-2 mt-1 text-xs text-gray-500">
                      {v.apenado.regime && <span>{v.apenado.regime}</span>}
                      {v.apenado.unidade && <span className="truncate">{v.apenado.unidade}</span>}
                    </div>
                  </div>
                  {v.apenado.faccao && (
                    <span
                      className="shrink-0 px-2 py-0.5 rounded-full text-xs font-bold text-white"
                      style={{ backgroundColor: v.apenado.faccao.cor || '#ef4444' }}
                    >
                      {v.apenado.faccao.sigla || v.apenado.faccao.nome}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export function AdvogadosImportados() {
  const [advogados, setAdvogados] = useState<Advogado[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<Advogado | null>(null)

  const fetchAdvogados = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams({ page: String(page), limit: '24' })
    if (q) params.set('q', q)

    const res = await fetch(`/api/sipe/advogados?${params}`)
    if (res.ok) {
      const data = await res.json()
      setAdvogados(data.advogados)
      setTotal(data.total)
      setTotalPages(data.totalPages)
    }
    setLoading(false)
  }, [page, q])

  useEffect(() => { fetchAdvogados() }, [fetchAdvogados])

  return (
    <div className="flex flex-col h-full min-h-0 gap-4">
      <div className="flex flex-wrap gap-3 items-center">
        <div className="flex-1 min-w-48 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar por nome, OAB ou CPF..."
            value={q}
            onChange={e => { setQ(e.target.value); setPage(1) }}
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
        <span className="text-sm text-gray-500">{total} advogado{total !== 1 ? 's' : ''}</span>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-40 text-gray-400">Carregando...</div>
        ) : advogados.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-gray-400 gap-2">
            <Shield className="w-8 h-8 opacity-30" />
            <p className="text-sm">Nenhum advogado importado ainda</p>
            <p className="text-xs">Os advogados são importados automaticamente junto com os apenados</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {advogados.map(a => (
              <AdvogadoCard key={a.id} advogado={a} onClick={() => setSelected(a)} />
            ))}
          </div>
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-40 transition-colors">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm text-gray-600 dark:text-gray-400">Página {page} de {totalPages}</span>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-40 transition-colors">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {selected && <AdvogadoModal advogado={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}
