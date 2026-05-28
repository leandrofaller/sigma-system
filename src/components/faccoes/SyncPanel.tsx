'use client'

import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { RefreshCw, Play, CheckCircle, XCircle, Clock, AlertCircle } from 'lucide-react'

const UNIDADES = [
  { id: '3', nome: 'CDPPVH - Centro de Detenção Provisório de Porto Velho' },
  { id: '1', nome: 'PANDA - Penitenciária Edvan Mariano Rosendo' },
  { id: '5', nome: 'Penitenciária Estadual Suely Maria Mendonça' },
  { id: '6', nome: 'UPES - Unidade Provisória de Segurança Especial' },
  { id: '9', nome: 'CAPEP I - Colônia Agrícola Penal Ênio Pinheiro' },
  { id: '16', nome: 'PEA - Penitenciária Estadual Aruana' },
  { id: '17', nome: 'Penitenciária Milton Soares de Carvalho' },
]

interface SyncJob {
  id: string
  status: string
  tipo: string
  unidadeNome: string | null
  total: number | null
  processado: number
  erros: number
  log: string | null
  iniciadoEm: string | null
  finalizadoEm: string | null
  createdAt: string
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { color: string; icon: React.ReactNode; label: string }> = {
    PENDING: { color: 'text-yellow-600 bg-yellow-50 dark:bg-yellow-900/20', icon: <Clock className="w-3 h-3" />, label: 'Aguardando' },
    RUNNING: { color: 'text-blue-600 bg-blue-50 dark:bg-blue-900/20', icon: <RefreshCw className="w-3 h-3 animate-spin" />, label: 'Executando' },
    COMPLETED: { color: 'text-green-600 bg-green-50 dark:bg-green-900/20', icon: <CheckCircle className="w-3 h-3" />, label: 'Concluído' },
    FAILED: { color: 'text-red-600 bg-red-50 dark:bg-red-900/20', icon: <XCircle className="w-3 h-3" />, label: 'Falhou' },
  }
  const s = map[status] || map.PENDING
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${s.color}`}>
      {s.icon} {s.label}
    </span>
  )
}

export function SyncPanel() {
  const [jobs, setJobs] = useState<SyncJob[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedUnidade, setSelectedUnidade] = useState('3')
  const [activeJobId, setActiveJobId] = useState<string | null>(null)

  const fetchJobs = async () => {
    const res = await fetch('/api/sipe/sync')
    if (res.ok) setJobs(await res.json())
  }

  useEffect(() => {
    fetchJobs()
    const interval = setInterval(fetchJobs, 3000)
    return () => clearInterval(interval)
  }, [])

  // Polling do job ativo
  useEffect(() => {
    if (!activeJobId) return
    const interval = setInterval(async () => {
      const res = await fetch(`/api/sipe/jobs?id=${activeJobId}`)
      if (res.ok) {
        const job: SyncJob = await res.json()
        if (job.status === 'COMPLETED' || job.status === 'FAILED') {
          setActiveJobId(null)
          setLoading(false)
          if (job.status === 'COMPLETED') toast.success('Sincronização concluída!')
          else toast.error('Sincronização falhou. Verifique o log.')
          fetchJobs()
        }
      }
    }, 2000)
    return () => clearInterval(interval)
  }, [activeJobId])

  const iniciarSync = async (tipo: string) => {
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
        setLoading(false)
        return
      }
      setActiveJobId(data.jobId)
      toast.info('Sincronização iniciada em background')
      fetchJobs()
    } catch {
      toast.error('Erro de conexão')
      setLoading(false)
    }
  }

  const jobAtivo = jobs.find(j => j.status === 'RUNNING' || j.status === 'PENDING')

  return (
    <div className="space-y-6">
      {/* Controles */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
        <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-4">
          Iniciar Sincronização com SIPE
        </h2>

        {jobAtivo && (
          <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg flex items-center gap-2 text-sm text-blue-700 dark:text-blue-300">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            Sincronização em andamento. Aguarde a conclusão antes de iniciar outra.
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Unidade Prisional
            </label>
            <select
              value={selectedUnidade}
              onChange={e => setSelectedUnidade(e.target.value)}
              disabled={!!jobAtivo || loading}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white px-3 py-2 text-sm focus:ring-2 focus:ring-red-500 focus:border-transparent"
            >
              {UNIDADES.map(u => (
                <option key={u.id} value={u.id}>{u.nome}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => iniciarSync('APENADOS')}
            disabled={!!jobAtivo || loading}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-400 text-white rounded-lg text-sm font-medium transition-colors"
          >
            {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            Sincronizar Apenados + Advogados
          </button>

          <button
            onClick={() => iniciarSync('FACCOES')}
            disabled={!!jobAtivo || loading}
            className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-900 dark:bg-gray-600 dark:hover:bg-gray-500 disabled:bg-gray-400 text-white rounded-lg text-sm font-medium transition-colors"
          >
            <Play className="w-4 h-4" />
            Importar Facções do SIPE
          </button>
        </div>
      </div>

      {/* Histórico de Jobs */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
        <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">Histórico de Sincronizações</h2>
          <button onClick={fetchJobs} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
            <RefreshCw className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        <div className="divide-y divide-gray-100 dark:divide-gray-700">
          {jobs.length === 0 && (
            <div className="p-8 text-center text-gray-400 text-sm">Nenhuma sincronização realizada</div>
          )}
          {jobs.map(job => {
            const pct = job.total ? Math.round((job.processado / job.total) * 100) : 0
            return (
              <div key={job.id} className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <StatusBadge status={job.status} />
                      <span className="text-xs text-gray-500">{job.tipo}</span>
                    </div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                      {job.unidadeNome || `Unidade ${job.tipo}`}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {new Date(job.createdAt).toLocaleString('pt-BR')}
                      {job.iniciadoEm && ` · Iniciado: ${new Date(job.iniciadoEm).toLocaleTimeString('pt-BR')}`}
                    </p>
                  </div>
                  <div className="text-right text-sm shrink-0">
                    {job.total != null && (
                      <p className="text-gray-700 dark:text-gray-300 font-medium">
                        {job.processado}/{job.total}
                      </p>
                    )}
                    {job.erros > 0 && (
                      <p className="text-red-500 text-xs">{job.erros} erros</p>
                    )}
                  </div>
                </div>

                {job.status === 'RUNNING' && job.total && (
                  <div className="mt-2">
                    <div className="h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-500 rounded-full transition-all duration-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <p className="text-xs text-gray-500 mt-1">{pct}%</p>
                  </div>
                )}

                {job.log && (
                  <details className="mt-2">
                    <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-700 dark:hover:text-gray-300">
                      Ver log
                    </summary>
                    <pre className="mt-1 text-xs text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-900 rounded p-2 overflow-auto max-h-32 whitespace-pre-wrap">
                      {job.log}
                    </pre>
                  </details>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
