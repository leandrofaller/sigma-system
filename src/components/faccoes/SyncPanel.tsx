'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { toast } from 'sonner'
import {
  RefreshCw, Play, CheckCircle, XCircle, Clock,
  AlertCircle, RotateCcw, Pause, Wifi, WifiOff, Trash2, ShieldAlert, AlertTriangle,
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
  const [usingPolling, setUsingPolling] = useState(false)
  const esRef = useRef<EventSource | null>(null)
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    let active = true
    let es: EventSource | null = null

    const startPollingFallback = () => {
      if (!active || pollIntervalRef.current) return
      setUsingPolling(true)
      setSseOk(false)
      
      if (esRef.current) {
        esRef.current.close()
      }

      const poll = async () => {
        try {
          const res = await fetch('/api/sipe/sync')
          if (!res.ok || !active) return
          const jobsList = await res.json()
          const currentJob = jobsList.find((j: any) => j.id === jobId)
          
          if (currentJob && active) {
            setLive({
              jobId: currentJob.id,
              status: currentJob.status,
              fase: currentJob.fase || 'Processando...',
              total: currentJob.total || 0,
              processado: currentJob.processado || 0,
              erros: currentJob.erros || 0,
              ultimoLog: currentJob.log ? currentJob.log.split('\n').filter(Boolean).pop() || '' : '',
              pct: currentJob.total ? Math.round((currentJob.processado / currentJob.total) * 100) : 0
            })

            if (currentJob.status !== 'RUNNING' && currentJob.status !== 'PENDING') {
              if (pollIntervalRef.current) clearInterval(pollIntervalRef.current)
              onFinished()
              if (currentJob.status === 'COMPLETED') toast.success('Sincronização concluída!')
              if (currentJob.status === 'INTERRUPTED') toast.warning('Sincronização interrompida.')
              if (currentJob.status === 'FAILED') toast.error('Sincronização falhou. Verifique o log.')
            }
          }
        } catch (err) {
          console.error('Erro no fallback de polling:', err)
        }
      }

      poll()
      pollIntervalRef.current = setInterval(poll, 3000)
    }

    try {
      es = new EventSource(`/api/sipe/sync/stream?jobId=${jobId}`)
      esRef.current = es
      setSseOk(true)

      es.onmessage = (e) => {
        if (!active) return
        try {
          const raw = JSON.parse(e.data)
          
          setLive((prev) => {
            if (raw.type === 'job-status') {
              return {
                jobId: raw.jobId,
                status: raw.status,
                fase: raw.fase || '',
                total: raw.total || 0,
                processado: raw.processado || 0,
                erros: raw.erros || 0,
                ultimoLog: raw.log ? raw.log.split('\n').filter(Boolean).pop() || '' : '',
                pct: raw.total ? Math.round((raw.processado / raw.total) * 100) : 0
              }
            }
            if (raw.type === 'progress') {
              const status = raw.status
              const processado = raw.processado || 0
              const erros = raw.erros || 0
              const total = prev?.total || 0
              
              if (status !== 'RUNNING' && status !== 'PENDING') {
                setTimeout(() => {
                  if (esRef.current) esRef.current.close()
                  onFinished()
                  if (status === 'COMPLETED') toast.success('Sincronização concluída!')
                  if (status === 'INTERRUPTED') toast.warning('Sincronização interrompida.')
                  if (status === 'FAILED') toast.error('Sincronização falhou. Verifique o log.')
                }, 100)
              }

              return {
                ...prev,
                status,
                processado,
                erros,
                pct: total ? Math.round((processado / total) * 100) : 0
              } as LiveProgress
            }
            if (raw.type === 'log') {
              const logLines = raw.message || ''
              return {
                ...prev,
                ultimoLog: logLines.split('\n').filter(Boolean).pop() || ''
              } as LiveProgress
            }
            return prev
          })
        } catch { /* ignore parse errors */ }
      }

      es.onerror = () => {
        if (!active) return
        startPollingFallback()
      }
    } catch (err) {
      console.error('Erro ao instanciar EventSource:', err)
      startPollingFallback()
    }

    const fallbackTimeout = setTimeout(() => {
      if (active && !live && !usingPolling) {
        startPollingFallback()
      }
    }, 4000)

    return () => {
      active = false
      if (es) es.close()
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current)
      clearTimeout(fallbackTimeout)
    }
  }, [jobId, onFinished, live, usingPolling])

  const handleStop = async () => {
    await fetch('/api/sipe/sync/stop', { method: 'POST' }).catch(() => {})
    toast.info('Sinal de parada enviado')
  }

  if (!live) {
    return (
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4 flex items-center gap-3">
        <RefreshCw className="w-4 h-4 animate-spin text-blue-600" />
        <span className="text-sm text-blue-700 dark:text-blue-300">
          {usingPolling ? 'Conectando ao servidor (polling)...' : 'Conectando ao stream de progresso...'}
        </span>
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
          {sseOk ? (
            <Wifi className="w-3.5 h-3.5 text-green-500" aria-label="Stream ativo" />
          ) : (
            <span title="Conexão em tempo real indisponível. Usando atualização periódica.">
              <WifiOff className="w-3.5 h-3.5 text-orange-400 animate-pulse" aria-label="Modo polling ativo" />
            </span>
          )}
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
          <span>
            {live.processado.toLocaleString('pt-BR')} / {(live.total || 0).toLocaleString('pt-BR')}{' '}
            {live.fase?.toLowerCase().includes('advogado') ? 'advogados' : 'apenados'}
          </span>
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
  const [confirmType, setConfirmType] = useState<'apenados' | 'advogados' | 'faccoes' | 'todos' | null>(null)
  const [clearingType, setClearingType] = useState<string | null>(null)
  const [unidades, setUnidades] = useState<Unidade[]>(UNIDADES_FALLBACK)
  const [loadingUnidades, setLoadingUnidades] = useState(true)

  const [unidadesFromSipe, setUnidadesFromSipe] = useState(false)

  // Busca a lista real de unidades do SIPE (com cache de 24h no servidor)
  useEffect(() => {
    let cancelled = false
    setLoadingUnidades(true)
    fetch('/api/sipe/unidades')
      .then(async (res) => {
        if (!res.ok) return // mantém fallback silenciosamente
        const data = await res.json()
        if (!cancelled && data.unidades?.length > 0) {
          setUnidades(data.unidades)
          setUnidadesFromSipe(!!data.fromSipe)
        }
      })
      .catch(() => { /* mantém fallback silenciosamente */ })
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

  const clearData = async (type: 'apenados' | 'advogados' | 'faccoes' | 'todos') => {
    setClearingType(type)
    try {
      const res = await fetch(`/api/sipe/clear-all?type=${type}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'Erro ao limpar dados')
        return
      }
      const { deletados } = data
      if (type === 'apenados') {
        toast.success(`Apenados e dependências removidos com sucesso (${deletados.apenados} apenados deletados)`)
      } else if (type === 'advogados') {
        toast.success(`Advogados e vínculos removidos com sucesso (${deletados.advogados} advogados deletados)`)
      } else if (type === 'faccoes') {
        toast.success(`Facções removidas com sucesso (${deletados.faccoes} facções deletadas)`)
      } else {
        toast.success(
          `Dados removidos: ${deletados.apenados || 0} apenados, ${deletados.advogados || 0} advogados, ${deletados.faccoes || 0} facções`
        )
      }
      setConfirmType(null)
      fetchJobs()
    } catch {
      toast.error('Erro de conexão')
    } finally {
      setClearingType(null)
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
          {!loadingUnidades && !unidadesFromSipe && (
            <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
              Lista local — SIPE inacessível ou credenciais não configuradas
            </p>
          )}
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => startSync('APENADOS')}
            disabled={isActive || loading}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-400 text-white rounded-lg text-sm font-medium transition-colors"
          >
            {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            Sincronizar Apenas Apenados
          </button>

          <button
            onClick={() => startSync('ADVOGADOS')}
            disabled={isActive || loading}
            className="flex items-center gap-2 px-4 py-2 bg-orange-600 hover:bg-orange-700 disabled:bg-gray-400 text-white rounded-lg text-sm font-medium transition-colors"
          >
            {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            Sincronizar Apenas Advogados
          </button>

          <button
            onClick={() => startSync('FACCOES')}
            disabled={isActive || loading}
            className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-900 dark:bg-gray-600 dark:hover:bg-gray-500 disabled:bg-gray-400 text-white rounded-lg text-sm font-medium transition-colors"
          >
            <Play className="w-4 h-4" />
            Importar Facções do SIPE
          </button>

          <button
            onClick={() => startSync('UNIDADES')}
            disabled={isActive || loading}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded-lg text-sm font-medium transition-colors"
          >
            <Play className="w-4 h-4" />
            Sincronizar Unidades Prisionais
          </button>

          <button
            onClick={() => startSync('EXTRAMUROS')}
            disabled={isActive || loading}
            title="Atualiza apenados com situações: Em Liberdade, Solto, Fuga, Prisão Domiciliar, etc."
            className="flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-700 disabled:bg-gray-400 text-white rounded-lg text-sm font-medium transition-colors"
          >
            <AlertTriangle className="w-4 h-4" />
            Sincronizar Extramuros
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
      <div className="bg-red-50/50 dark:bg-red-950/10 rounded-2xl border border-red-200 dark:border-red-900/40 p-6 space-y-6">
        <div className="flex items-start gap-3">
          <ShieldAlert className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
          <div>
            <h3 className="text-sm font-semibold text-red-800 dark:text-red-300">Zona de Risco</h3>
            <p className="text-xs text-red-600/80 dark:text-red-400/80 mt-0.5">
              Ações para exclusão de dados sincronizados do SIPE. Você pode apagar os dados de forma individual (independente) por categoria ou limpar toda a base.
            </p>
          </div>
        </div>

        {confirmType ? (
          <div className="bg-white dark:bg-gray-900 border border-red-200 dark:border-red-900/50 rounded-xl p-4 space-y-3 shadow-md">
            <p className="text-sm font-semibold text-red-700 dark:text-red-400">
              {confirmType === 'apenados' && 'Confirmar exclusão de Apenados?'}
              {confirmType === 'advogados' && 'Confirmar exclusão de Advogados?'}
              {confirmType === 'faccoes' && 'Confirmar exclusão de Facções?'}
              {confirmType === 'todos' && 'Confirmar exclusão Completa?'}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {confirmType === 'apenados' && 'Esta ação apagará permanentemente todos os apenados importados, bem como seus respectivos processos, alcunhas, históricos, documentos e vínculos. Os advogados e facções serão mantidos.'}
              {confirmType === 'advogados' && 'Esta ação apagará permanentemente todos os advogados importados e seus vínculos de atendimento. Os apenados e facções serão mantidos.'}
              {confirmType === 'faccoes' && 'Esta ação apagará permanentemente as facções do banco. As referências de facções nos perfis dos apenados serão definidas como nulas/vazias.'}
              {confirmType === 'todos' && 'Esta ação apagará permanentemente toda a base de dados sincronizada (apenados, processos, advogados, facções, visitantes e logs de sync).'}
            </p>
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => clearData(confirmType)}
                disabled={clearingType !== null || isActive}
                className="flex items-center gap-2 px-3 py-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-400 text-white rounded-lg text-xs font-bold transition-colors shadow-sm"
              >
                {clearingType === confirmType ? (
                  <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Excluindo...</>
                ) : (
                  <><Trash2 className="w-3.5 h-3.5" /> Confirmar Exclusão</>
                )}
              </button>
              <button
                onClick={() => setConfirmType(null)}
                disabled={clearingType !== null}
                className="px-3 py-2 text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <button
              onClick={() => setConfirmType('apenados')}
              disabled={isActive || clearingType !== null}
              className="flex items-center justify-center gap-2 px-4 py-2.5 bg-red-50 hover:bg-red-100 dark:bg-red-950/20 dark:hover:bg-red-950/40 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-900/50 rounded-xl text-xs font-semibold transition-all disabled:opacity-50"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Excluir Apenados
            </button>
            
            <button
              onClick={() => setConfirmType('advogados')}
              disabled={isActive || clearingType !== null}
              className="flex items-center justify-center gap-2 px-4 py-2.5 bg-red-50 hover:bg-red-100 dark:bg-red-950/20 dark:hover:bg-red-950/40 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-900/50 rounded-xl text-xs font-semibold transition-all disabled:opacity-50"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Excluir Advogados
            </button>

            <button
              onClick={() => setConfirmType('faccoes')}
              disabled={isActive || clearingType !== null}
              className="flex items-center justify-center gap-2 px-4 py-2.5 bg-red-50 hover:bg-red-100 dark:bg-red-950/20 dark:hover:bg-red-950/40 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-900/50 rounded-xl text-xs font-semibold transition-all disabled:opacity-50"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Excluir Facções
            </button>

            <button
              onClick={() => setConfirmType('todos')}
              disabled={isActive || clearingType !== null}
              className="flex items-center justify-center gap-2 px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold transition-all disabled:opacity-50 shadow-sm"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Limpar Tudo
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
