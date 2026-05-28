'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { toast } from 'sonner'
import {
  RefreshCw, Play, CheckCircle, XCircle, Clock,
  AlertCircle, RotateCcw, Pause, Wifi, WifiOff, Trash2, ShieldAlert,
} from 'lucide-react'

// Lista de fallback usada quando o SIPE estiver inacessível
const UNIDADES_FALLBACK = [
  { id: '3',  nome: 'CDPPVH - Centro de Detenção Provisório de Porto Velho' },
  { id: '1',  nome: 'PANDA - Penitenciária Edvan Mariano Rosendo' },
  { id: '5',  nome: 'Penitenciária Estadual Suely Maria Mendonça' },
  { id: '6',  nome: 'UPES - Unidade Provisória de Segurança Especial' },
  { id: '9',  nome: 'CAPEP I - Colônia Agrícola Penal Ênio Pinheiro' },
  { id: '16', nome: 'PEA - Penitenciária Estadual Aruana' },
  { id: '17', nome: 'Penitenciária Milton Soares de Carvalho' },
  { id: '91', nome: 'Penitenciária Jorge Thiago Aguiar Afonso' },
  { id: '12', nome: 'CRVG - Centro de Ressocialização Vale do Guaporé' },
  { id: '25', nome: 'Centro de Ressocialização Jonas Ferreti' },
]

interface Unidade { id: string; nome: string }

interface SyncJob {
  id: string
  status: string
  tipo: string
  unidadeNome: string | null
  total: number | null
  processado: number
  erros: number
  log: string | null
  fase: string | null
  ultimoIdProcessado: number | null
  iniciadoEm: string | null
  finalizadoEm: string | null
  ultimaAtividade: string | null
  createdAt: string
}

// SSE live progress (in-memory state shape from sipe-scraper)
interface LiveProgress {
  jobId?: string
  status: string
  fase: string
  total: number
  processado: number
  erros: number
  ultimoLog: string
  pct: number
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { color: string; icon: React.ReactNode; label: string }> = {
    PENDING:     { color: 'text-yellow-600 bg-yellow-50 dark:bg-yellow-900/20',  icon: <Clock className="w-3 h-3" />, label: 'Aguardando' },
    RUNNING:     { color: 'text-blue-600 bg-blue-50 dark:bg-blue-900/20',        icon: <RefreshCw className="w-3 h-3 animate-spin" />, label: 'Executando' },
    COMPLETED:   { color: 'text-green-600 bg-green-50 dark:bg-green-900/20',     icon: <CheckCircle className="w-3 h-3" />, label: 'Concluído' },
    FAILED:      { color: 'text-red-600 bg-red-50 dark:bg-red-900/20',           icon: <XCircle className="w-3 h-3" />, label: 'Falhou' },
    INTERRUPTED: { color: 'text-orange-600 bg-orange-50 dark:bg-orange-900/20',  icon: <Pause className="w-3 h-3" />, label: 'Interrompido' },
  }
  const s = map[status] || map.PENDING
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${s.color}`}>
      {s.icon} {s.label}
    </span>
  )
}

// ── Active Job Card with SSE ──────────────────────────────────
function ActiveJobCard({
  jobId,
  onFinished,
}: {
  jobId: string
  onFinished: () => void
}) {
  const [live, setLive] = useState<LiveProgress | null>(null)
  const [sseOk, setSseOk] = useState(true)
  const esRef = useRef<EventSource | null>(null)

  useEffect(() => {
    const es = new EventSource(`/api/sipe/sync/stream?jobId=${jobId}`)
    esRef.current = es
    setSseOk(true)

    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data) as LiveProgress
        setLive(data)
        if (data.status !== 'RUNNING' && data.status !== 'PENDING') {
          es.close()
          onFinished()
          if (data.status === 'COMPLETED') toast.success('Sincronização concluída!')
          if (data.status === 'INTERRUPTED') toast.warning('Sincronização interrompida — pode ser retomada.')
          if (data.status === 'FAILED') toast.error('Sincronização falhou. Verifique o log.')
        }
      } catch { /* ignore parse errors */ }
    }

    es.onerror = () => {
      setSseOk(false)
      // SSE errors are often transient; EventSource auto-reconnects
    }

    return () => { es.close() }
  }, [jobId, onFinished])

  const handleStop = async () => {
    await fetch('/api/sipe/sync/stop', { method: 'POST' }).catch(() => {})
    toast.info('Sinal de parada enviado')
  }

  if (!live) {
    return (
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4 flex items-center gap-3">
        <RefreshCw className="w-4 h-4 animate-spin text-blue-600" />
        <span className="text-sm text-blue-700 dark:text-blue-300">Conectando ao stream de progresso...</span>
      </div>
    )
  }

  const pct = live.pct ?? (live.total ? Math.round((live.processado / live.total) * 100) : 0)

  return (
    <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-5 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <RefreshCw className="w-4 h-4 animate-spin text-blue-600 dark:text-blue-400 flex-shrink-0" />
          <span className="text-sm font-semibold text-blue-800 dark:text-blue-200">
            {live.fase || 'Sincronizando...'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {sseOk
            ? <Wifi className="w-3.5 h-3.5 text-green-500" aria-label="Stream ativo" />
            : <WifiOff className="w-3.5 h-3.5 text-red-400 animate-pulse" aria-label="Reconectando..." />
          }
          <button
            onClick={handleStop}
            className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-medium transition-colors"
          >
            Interromper
          </button>
        </div>
      </div>

      {/* Progress bar */}
      <div>
        <div className="flex justify-between text-xs text-blue-700 dark:text-blue-300 mb-1">
          <span>{live.processado.toLocaleString('pt-BR')} / {(live.total || 0).toLocaleString('pt-BR')} apenados</span>
          <span className="font-bold">{pct}%</span>
        </div>
        <div className="h-2 bg-blue-200 dark:bg-blue-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-blue-600 dark:bg-blue-400 rounded-full transition-all duration-700"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {live.erros > 0 && (
        <p className="text-xs text-red-600 dark:text-red-400">⚠ {live.erros} erro{live.erros > 1 ? 's' : ''} registrado{live.erros > 1 ? 's' : ''}</p>
      )}

      {live.ultimoLog && (
        <p className="text-xs text-blue-700/70 dark:text-blue-300/70 italic truncate">{live.ultimoLog}</p>
      )}
    </div>
  )
}

// ── Main SyncPanel ────────────────────────────────────────────
export function SyncPanel() {
  const [jobs, setJobs] = useState<SyncJob[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedUnidade, setSelectedUnidade] = useState('3')
  const [activeJobId, setActiveJobId] = useState<string | null>(null)
  const [confirmClear, setConfirmClear] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [confirmClearAll, setConfirmClearAll] = useState(false)
  const [clearingAll, setClearingAll] = useState(false)
  const [unidades, setUnidades] = useState<Unidade[]>(UNIDADES_FALLBACK)
  const [loadingUnidades, setLoadingUnidades] = useState(true)

  // Busca a lista real de unidades do SIPE (com cache de 24h no servidor)
  useEffect(() => {
    let cancelled = false
    setLoadingUnidades(true)
    fetch('/api/sipe/unidades')
      .then(async (res) => {
        if (!res.ok) throw new Error(`status ${res.status}`)
        const data = await res.json()
        if (!cancelled && data.unidades?.length > 0) {
          setUnidades(data.unidades)
        }
      })
      .catch(() => {
        if (!cancelled) toast.warning('Lista de unidades carregada do cache local — SIPE pode estar inacessível')
      })
      .finally(() => { if (!cancelled) setLoadingUnidades(false) })
    return () => { cancelled = true }
  }, [])

  const fetchJobs = useCallback(async () => {
    const res = await fetch('/api/sipe/sync')
    if (res.ok) {
      const data: SyncJob[] = await res.json()
      setJobs(data)
      // If there's a running job not tracked, attach SSE to it
      const running = data.find((j) => j.status === 'RUNNING' || j.status === 'PENDING')
      if (running && !activeJobId) setActiveJobId(running.id)
    }
  }, [activeJobId])

  useEffect(() => {
    fetchJobs()
    // Background poll for history list (slower cadence — SSE handles live data)
    const interval = setInterval(fetchJobs, 15_000)
    return () => clearInterval(interval)
  }, [fetchJobs])

  const startSync = async (tipo: string) => {
    setLoading(true)
    try {
      const res = await fetch('/api/sipe/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ unidadeId: selectedUnidade, tipo }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'Erro ao iniciar sincronização')
        return
      }
      setActiveJobId(data.jobId)
      toast.info('Sincronização iniciada')
      fetchJobs()
    } catch {
      toast.error('Erro de conexão')
    } finally {
      setLoading(false)
    }
  }

  const resumeJob = async (jobId: string) => {
    setLoading(true)
    try {
      const res = await fetch('/api/sipe/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resumeJobId: jobId }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'Erro ao retomar')
        return
      }
      setActiveJobId(data.jobId)
      toast.success('Sincronização retomada do checkpoint')
      fetchJobs()
    } catch {
      toast.error('Erro de conexão')
    } finally {
      setLoading(false)
    }
  }

  const clearHistory = async () => {
    setClearing(true)
    try {
      const res = await fetch('/api/sipe/sync/history', { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'Erro ao limpar histórico')
        return
      }
      toast.success(`${data.deletados} registro${data.deletados !== 1 ? 's' : ''} removido${data.deletados !== 1 ? 's' : ''}`)
      setConfirmClear(false)
      fetchJobs()
    } catch {
      toast.error('Erro de conexão')
    } finally {
      setClearing(false)
    }
  }

  const clearAllData = async () => {
    setClearingAll(true)
    try {
      const res = await fetch('/api/sipe/clear-all', { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'Erro ao limpar dados')
        return
      }
      const { deletados } = data
      toast.success(
        `Dados removidos: ${deletados.apenados} apenados, ${deletados.advogados} advogados, ${deletados.faccoes} facções`
      )
      setConfirmClearAll(false)
      fetchJobs()
    } catch {
      toast.error('Erro de conexão')
    } finally {
      setClearingAll(false)
    }
  }

  const isActive = !!activeJobId && jobs.some(
    (j) => j.id === activeJobId && (j.status === 'RUNNING' || j.status === 'PENDING')
  )

  return (
    <div className="space-y-6">
      {/* Live progress card (SSE) */}
      {isActive && (
        <ActiveJobCard
          jobId={activeJobId!}
          onFinished={() => {
            setActiveJobId(null)
            fetchJobs()
          }}
        />
      )}

      {/* Controls */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
        <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-4">
          Iniciar Sincronização com SIPE
        </h2>

        <div className="mb-4">
          <div className="flex items-center gap-2 mb-1">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Unidade Prisional
            </label>
            {loadingUnidades && (
              <RefreshCw className="w-3 h-3 text-gray-400 animate-spin" aria-label="Carregando unidades..." />
            )}
          </div>
          <select
            value={selectedUnidade}
            onChange={(e) => setSelectedUnidade(e.target.value)}
            disabled={isActive || loading || loadingUnidades}
            className="w-full max-w-md rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white px-3 py-2 text-sm focus:ring-2 focus:ring-red-500 focus:border-transparent disabled:opacity-60"
          >
            {unidades.map((u) => (
              <option key={u.id} value={u.id}>{u.nome}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => startSync('APENADOS')}
            disabled={isActive || loading}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-400 text-white rounded-lg text-sm font-medium transition-colors"
          >
            {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            Sincronizar Apenados + Advogados
          </button>

          <button
            onClick={() => startSync('FACCOES')}
            disabled={isActive || loading}
            className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-900 dark:bg-gray-600 dark:hover:bg-gray-500 disabled:bg-gray-400 text-white rounded-lg text-sm font-medium transition-colors"
          >
            <Play className="w-4 h-4" />
            Importar Facções do SIPE
          </button>
        </div>
      </div>

      {/* Job History */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
        <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">Histórico de Sincronizações</h2>

          <div className="flex items-center gap-2">
            {/* Confirmação inline de limpeza */}
            {confirmClear ? (
              <div className="flex items-center gap-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-3 py-1.5">
                <span className="text-xs text-red-700 dark:text-red-300 font-medium">Remover todo o histórico?</span>
                <button
                  onClick={clearHistory}
                  disabled={clearing}
                  className="px-2 py-0.5 bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white rounded text-xs font-medium transition-colors"
                >
                  {clearing ? 'Limpando...' : 'Confirmar'}
                </button>
                <button
                  onClick={() => setConfirmClear(false)}
                  disabled={clearing}
                  className="px-2 py-0.5 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded text-xs transition-colors"
                >
                  Cancelar
                </button>
              </div>
            ) : (
              jobs.some((j) => ['COMPLETED', 'FAILED', 'INTERRUPTED'].includes(j.status)) && (
                <button
                  onClick={() => setConfirmClear(true)}
                  disabled={isActive}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors disabled:opacity-40"
                  title="Remover todos os registros finalizados do histórico"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Limpar histórico
                </button>
              )
            )}

            <button
              onClick={fetchJobs}
              className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              title="Atualizar lista"
            >
              <RefreshCw className="w-4 h-4 text-gray-500" />
            </button>
          </div>
        </div>

        <div className="divide-y divide-gray-100 dark:divide-gray-700">
          {jobs.length === 0 && (
            <div className="p-8 text-center text-gray-400 text-sm">
              Nenhuma sincronização realizada
            </div>
          )}

          {jobs.map((job) => {
            const pct = job.total ? Math.round((job.processado / job.total) * 100) : 0
            const isInterrupted = job.status === 'INTERRUPTED'
            const cursor = job.ultimoIdProcessado

            return (
              <div key={job.id} className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <StatusBadge status={job.status} />
                      <span className="text-xs text-gray-500">{job.tipo}</span>
                      {job.fase && (
                        <span className="text-xs text-gray-400 italic">{job.fase}</span>
                      )}
                    </div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                      {job.unidadeNome || `Unidade ${job.tipo}`}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {new Date(job.createdAt).toLocaleString('pt-BR')}
                      {job.iniciadoEm && ` · Iniciado: ${new Date(job.iniciadoEm).toLocaleTimeString('pt-BR')}`}
                    </p>
                    {isInterrupted && cursor != null && (
                      <p className="text-xs text-orange-600 dark:text-orange-400 mt-1">
                        Checkpoint: ID #{cursor} — {job.processado}/{job.total ?? '?'} processados
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {job.total != null && (
                      <div className="text-right text-sm">
                        <p className="text-gray-700 dark:text-gray-300 font-medium">
                          {job.processado}/{job.total}
                        </p>
                        {job.erros > 0 && (
                          <p className="text-red-500 text-xs">{job.erros} erros</p>
                        )}
                      </div>
                    )}
                    {/* Resume button for interrupted jobs */}
                    {isInterrupted && !isActive && (
                      <button
                        onClick={() => resumeJob(job.id)}
                        disabled={loading}
                        className="flex items-center gap-1 px-3 py-1.5 bg-orange-600 hover:bg-orange-700 disabled:bg-gray-400 text-white rounded-lg text-xs font-medium transition-colors"
                        title={`Retomar do ID #${cursor}`}
                      >
                        <RotateCcw className="w-3 h-3" />
                        Retomar
                      </button>
                    )}
                  </div>
                </div>

                {/* Progress bar for non-live jobs */}
                {job.status !== 'RUNNING' && job.total && job.total > 0 && (
                  <div className="mt-2">
                    <div className="h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          job.status === 'COMPLETED'
                            ? 'bg-green-500'
                            : job.status === 'INTERRUPTED'
                            ? 'bg-orange-500'
                            : 'bg-red-500'
                        }`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">{pct}%</p>
                  </div>
                )}

                {/* Duration for completed jobs */}
                {job.status === 'COMPLETED' && job.iniciadoEm && job.finalizadoEm && (
                  <p className="text-xs text-gray-400 mt-1">
                    Duração:{' '}
                    {Math.round(
                      (new Date(job.finalizadoEm).getTime() -
                        new Date(job.iniciadoEm).getTime()) /
                        60_000
                    )}{' '}
                    min
                  </p>
                )}

                {/* Interrupted warning */}
                {isInterrupted && (
                  <div className="mt-2 flex items-center gap-1.5 text-xs text-orange-600 dark:text-orange-400">
                    <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                    Interrompido (reinicialização da VPS ou falha). Clique em &quot;Retomar&quot; para continuar do ponto salvo.
                  </div>
                )}

                {job.log && (
                  <details className="mt-2">
                    <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-700 dark:hover:text-gray-300">
                      Ver log
                    </summary>
                    <pre className="mt-1 text-xs text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-900 rounded p-2 overflow-auto max-h-32 whitespace-pre-wrap">
                      {job.log.split('\n').slice(-20).join('\n')}
                    </pre>
                  </details>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Zona de Risco — apenas Superadmin */}
      <div className="bg-red-50 dark:bg-red-950/20 rounded-xl border border-red-200 dark:border-red-900/40 p-5">
        <div className="flex items-start gap-3 mb-4">
          <ShieldAlert className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
          <div>
            <h3 className="text-sm font-semibold text-red-800 dark:text-red-300">Zona de Risco</h3>
            <p className="text-xs text-red-600 dark:text-red-400 mt-0.5">
              Esta ação apaga permanentemente <strong>todos</strong> os dados sincronizados do SIPE — apenados, facções, advogados, processos, históricos e o histórico de sincronizações. Use somente para resetar a base antes de uma nova sincronização completa.
            </p>
          </div>
        </div>

        {confirmClearAll ? (
          <div className="bg-white dark:bg-gray-900 border border-red-300 dark:border-red-800 rounded-lg p-4 space-y-3">
            <p className="text-sm font-medium text-red-700 dark:text-red-300">
              Tem certeza? Esta ação <strong>não pode ser desfeita</strong>.
            </p>
            <p className="text-xs text-red-600 dark:text-red-400">
              Todos os dados do SIPE serão removidos permanentemente do banco de dados.
            </p>
            <div className="flex gap-2">
              <button
                onClick={clearAllData}
                disabled={clearingAll || isActive}
                className="flex items-center gap-2 px-4 py-2 bg-red-700 hover:bg-red-800 disabled:bg-gray-400 text-white rounded-lg text-sm font-bold transition-colors"
              >
                {clearingAll ? (
                  <><RefreshCw className="w-4 h-4 animate-spin" /> Limpando...</>
                ) : (
                  <><Trash2 className="w-4 h-4" /> Sim, apagar tudo</>
                )}
              </button>
              <button
                onClick={() => setConfirmClearAll(false)}
                disabled={clearingAll}
                className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setConfirmClearAll(true)}
            disabled={isActive}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-400 text-white rounded-lg text-sm font-medium transition-colors"
          >
            <Trash2 className="w-4 h-4" />
            Limpar todos os dados do SIPE
          </button>
        )}
      </div>
    </div>
  )
}
