'use client'

import { useState, useEffect, useCallback } from 'react'
import { Search, ChevronLeft, ChevronRight, Briefcase, Users, Phone, Shield } from 'lucide-react'
import { toast } from 'sonner'
import { ApenadoModal } from './ApenadosImportados'

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
  endereco: string | null
  photoPath: string | null
  dataCadastro: string | null
  vinculos: VinculoApenado[]
}

const getPhotoUrl = (path: string) => {
  if (path.startsWith('uploads/')) {
    return `/api/${path}`;
  }
  return `/api/uploads/${path}`;
};

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
        {advogado.photoPath ? (
          <img
            src={getPhotoUrl(advogado.photoPath)}
            alt={advogado.nome}
            className="w-10 h-10 rounded-xl object-cover shrink-0 border border-gray-100 dark:border-gray-700/50"
          />
        ) : (
          <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-xl flex items-center justify-center shrink-0">
            <Briefcase className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          </div>
        )}
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

function AdvogadoModal({
  advogado,
  onClose,
  onApenadoClick,
}: {
  advogado: Advogado
  onClose: () => void
  onApenadoClick: (id: string) => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              {advogado.photoPath ? (
                <img
                  src={getPhotoUrl(advogado.photoPath)}
                  alt={advogado.nome}
                  className="w-14 h-14 rounded-xl object-cover shrink-0 border border-gray-200 dark:border-gray-600 shadow-sm"
                />
              ) : (
                <div className="w-14 h-14 bg-blue-100 dark:bg-blue-900/30 rounded-xl flex items-center justify-center shrink-0">
                  <Briefcase className="w-7 h-7 text-blue-600 dark:text-blue-400" />
                </div>
              )}
              <div>
                <h2 className="text-lg font-bold text-gray-900 dark:text-white">{advogado.nome}</h2>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-500 mt-0.5">
                  {advogado.oab && <span>OAB {advogado.oab}</span>}
                  {advogado.cpf && <span>CPF {advogado.cpf}</span>}
                  {advogado.telefone && <span>Tel: {advogado.telefone}</span>}
                </div>
              </div>
            </div>
            <button 
              onClick={onClose} 
              className="p-2 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-xl transition-colors text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300"
              title="Fechar"
            >
              ✕
            </button>
          </div>
        </div>

        {advogado.endereco && (
          <div className="p-6 border-b border-gray-100 dark:border-gray-700/50">
            <div className="space-y-1 text-sm">
              <span className="font-semibold text-gray-700 dark:text-gray-300">Endereço Profissional:</span>
              <p className="text-gray-600 dark:text-gray-400 leading-relaxed bg-gray-50 dark:bg-gray-700/20 p-3 rounded-lg border border-gray-200/50 dark:border-gray-700/30">{advogado.endereco}</p>
            </div>
          </div>
        )}

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
                    <button
                      onClick={() => onApenadoClick(v.apenado.id)}
                      className="text-sm font-semibold text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 text-left hover:underline truncate block"
                    >
                      {v.apenado.nome}
                    </button>
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
  const [selectedApenado, setSelectedApenado] = useState<any | null>(null)
  const [loadingApenado, setLoadingApenado] = useState(false)

  const handleApenadoClick = async (apenadoId: string) => {
    setLoadingApenado(true)
    try {
      const res = await fetch(`/api/sipe/apenados/${apenadoId}`)
      if (res.ok) {
        const data = await res.json()
        setSelectedApenado(data)
      } else {
        toast.error('Erro ao buscar detalhes do apenado')
      }
    } catch {
      toast.error('Erro de conexão ao buscar apenado')
    } finally {
      setLoadingApenado(false)
    }
  }

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

  const [syncingCna, setSyncingCna] = useState(false)
  const [activeCnaJob, setActiveCnaJob] = useState<any>(null)
  const [isAnyJobActive, setIsAnyJobActive] = useState(false)

  const checkSyncJobs = useCallback(async () => {
    try {
      const res = await fetch('/api/sipe/sync')
      if (res.ok) {
        const jobsList = await res.json()
        const anyRunning = jobsList.some((j: any) => j.status === 'RUNNING')
        const runningCna = jobsList.find((j: any) => j.status === 'RUNNING' && j.tipo === 'ADVOGADOS_CNA')
        
        setIsAnyJobActive(anyRunning)
        
        // Se o job terminou (estava ativo e agora não está mais), recarrega a lista
        if (activeCnaJob && !runningCna) {
          fetchAdvogados()
        }
        
        setActiveCnaJob(runningCna || null)
      }
    } catch (e) {
      console.error('Erro ao verificar jobs ativos:', e)
    }
  }, [activeCnaJob, fetchAdvogados])

  useEffect(() => {
    checkSyncJobs()
    const interval = setInterval(checkSyncJobs, 3000)
    return () => clearInterval(interval)
  }, [checkSyncJobs])

  const handleSyncCna = async () => {
    setSyncingCna(true)
    try {
      const res = await fetch('/api/sipe/advogados/sync-cna-all', { method: 'POST' })
      const data = await res.json()
      if (res.ok) {
        toast.success(data.message || 'Sincronização iniciada com sucesso!')
        checkSyncJobs()
      } else {
        toast.error(data.error || 'Erro ao iniciar sincronização')
      }
    } catch {
      toast.error('Erro de conexão com o servidor')
    } finally {
      setSyncingCna(false)
    }
  }

  return (
    <div className="flex flex-col h-full min-h-0 gap-4">
      <div className="flex flex-wrap gap-3 items-center justify-between">
        <div className="flex flex-wrap gap-3 items-center flex-1 min-w-48">
          <div className="flex-1 max-w-md relative">
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

        <div className="flex flex-col items-end gap-1">
          <button
            onClick={handleSyncCna}
            disabled={syncingCna || (isAnyJobActive && !activeCnaJob)}
            className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded-lg text-sm font-semibold transition-colors shadow-sm"
          >
            {syncingCna || activeCnaJob ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
            ) : (
              <Users className="w-4 h-4" />
            )}
            {activeCnaJob
              ? `Sincronizando CNA (${activeCnaJob.processado}/${activeCnaJob.total ?? '?'})`
              : isAnyJobActive
              ? 'Sincronizador Ocupado'
              : 'Sincronizar Fotos/Dados (CNA)'}
          </button>
          
          {activeCnaJob && (
            <span className="text-[10px] text-gray-500 animate-pulse">
              Acompanhe os logs na aba Sincronização
            </span>
          )}
        </div>
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

      {selected && (
        <AdvogadoModal
          advogado={selected}
          onClose={() => setSelected(null)}
          onApenadoClick={handleApenadoClick}
        />
      )}

      {selectedApenado && (
        <ApenadoModal
          apenado={selectedApenado}
          onClose={() => setSelectedApenado(null)}
        />
      )}

      {loadingApenado && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 backdrop-blur-[2px]">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-xl flex items-center gap-3">
            <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
            <span className="text-sm font-medium text-gray-900 dark:text-white">Buscando ficha do apenado...</span>
          </div>
        </div>
      )}
    </div>
  )
}
