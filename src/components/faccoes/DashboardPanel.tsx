'use client'

import { useState, useEffect, useCallback } from 'react'
import { RefreshCw, Users, Briefcase, Shield, Link2, Hash, FileText } from 'lucide-react'

interface Stats {
  totais: {
    apenados: number
    advogados: number
    faccoes: number
    vinculosAdvogados: number
    vinculosVisitantes: number
    alcunhas: number
    processos: number
  }
  porFaccao: Array<{ faccaoId: string | null; nome: string; sigla: string | null; cor: string; total: number }>
  porRegime: Array<{ regime: string | null; total: number }>
  porSituacao: Array<{ situacao: string | null; total: number }>
  ultimaSync: { finalizadoEm: string; unidadeNome: string | null; processado: number } | null
}

function StatCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: number
  color: string
}) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 flex items-center gap-4">
      <div className={`p-2.5 rounded-lg ${color}`}>
        <Icon className="w-5 h-5 text-white" />
      </div>
      <div>
        <p className="text-2xl font-bold text-gray-900 dark:text-white">
          {value.toLocaleString('pt-BR')}
        </p>
        <p className="text-sm text-gray-500 dark:text-gray-400">{label}</p>
      </div>
    </div>
  )
}

function HorizontalBar({
  label,
  value,
  max,
  color,
}: {
  label: string
  value: number
  max: number
  color: string
}) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm">
        <span className="text-gray-700 dark:text-gray-300 truncate max-w-[70%]">{label}</span>
        <span className="text-gray-500 font-medium">{value.toLocaleString('pt-BR')}</span>
      </div>
      <div className="h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
    </div>
  )
}

export function DashboardPanel() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)

  const fetch_ = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/sipe/stats')
    if (res.ok) setStats(await res.json())
    setLoading(false)
  }, [])

  useEffect(() => { fetch_() }, [fetch_])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-40 gap-2 text-gray-400">
        <RefreshCw className="w-4 h-4 animate-spin" />
        <span className="text-sm">Carregando estatísticas...</span>
      </div>
    )
  }

  if (!stats) {
    return (
      <div className="flex items-center justify-center h-40 text-gray-400 text-sm">
        Erro ao carregar estatísticas
      </div>
    )
  }

  const { totais, porFaccao, porRegime, porSituacao, ultimaSync } = stats
  const maxFaccao = Math.max(...porFaccao.map((f) => f.total), 1)
  const maxRegime = Math.max(...porRegime.map((r) => r.total), 1)
  const maxSituacao = Math.max(...porSituacao.map((s) => s.total), 1)

  return (
    <div className="space-y-6">
      {/* Last sync info */}
      {ultimaSync && (
        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          <span className="text-green-700 dark:text-green-300 font-medium">
            Última sincronização bem-sucedida
          </span>
          <span className="text-green-600 dark:text-green-400">
            {new Date(ultimaSync.finalizadoEm).toLocaleString('pt-BR')}
          </span>
          {ultimaSync.unidadeNome && (
            <span className="text-green-600/70 dark:text-green-400/70 text-xs truncate">
              {ultimaSync.unidadeNome}
            </span>
          )}
          <span className="text-green-600 dark:text-green-400">
            {ultimaSync.processado.toLocaleString('pt-BR')} apenados processados
          </span>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-4">
        <StatCard icon={Users}     label="Apenados importados" value={totais.apenados}          color="bg-red-500" />
        <StatCard icon={Shield}    label="Facções"              value={totais.faccoes}            color="bg-purple-600" />
        <StatCard icon={Briefcase} label="Advogados"            value={totais.advogados}          color="bg-blue-600" />
        <StatCard icon={Link2}     label="Vínculos advogados"   value={totais.vinculosAdvogados}  color="bg-cyan-600" />
        <StatCard icon={Hash}      label="Alcunhas registradas" value={totais.alcunhas}           color="bg-orange-500" />
        <StatCard icon={FileText}  label="Processos criminais"  value={totais.processos}          color="bg-gray-600" />
        <StatCard icon={Link2}     label="Vínculos visitantes"  value={totais.vinculosVisitantes} color="bg-teal-600" />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Por Facção */}
        <div className="lg:col-span-1 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4 flex items-center gap-2">
            <Shield className="w-4 h-4" /> Apenados por Facção
          </h3>
          {porFaccao.length === 0 ? (
            <p className="text-sm text-gray-400">Nenhum apenado faccionado importado</p>
          ) : (
            <div className="space-y-3">
              {porFaccao.slice(0, 8).map((f) => (
                <HorizontalBar
                  key={f.faccaoId ?? 'none'}
                  label={f.sigla ? `${f.sigla} — ${f.nome}` : f.nome}
                  value={f.total}
                  max={maxFaccao}
                  color={f.cor}
                />
              ))}
            </div>
          )}
        </div>

        {/* Por Regime */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4 flex items-center gap-2">
            <Users className="w-4 h-4" /> Por Regime Prisional
          </h3>
          {porRegime.length === 0 ? (
            <p className="text-sm text-gray-400">Sem dados</p>
          ) : (
            <div className="space-y-3">
              {porRegime.map((r) => (
                <HorizontalBar
                  key={r.regime ?? 'desconhecido'}
                  label={r.regime ?? 'Não informado'}
                  value={r.total}
                  max={maxRegime}
                  color="#6366f1"
                />
              ))}
            </div>
          )}
        </div>

        {/* Por Situação */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4 flex items-center gap-2">
            <FileText className="w-4 h-4" /> Por Situação Processual
          </h3>
          {porSituacao.length === 0 ? (
            <p className="text-sm text-gray-400">Sem dados</p>
          ) : (
            <div className="space-y-3">
              {porSituacao.map((s) => (
                <HorizontalBar
                  key={s.situacao ?? 'desconhecido'}
                  label={s.situacao ?? 'Não informado'}
                  value={s.total}
                  max={maxSituacao}
                  color="#10b981"
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Refresh button */}
      <div className="flex justify-end">
        <button
          onClick={fetch_}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Atualizar estatísticas
        </button>
      </div>
    </div>
  )
}
