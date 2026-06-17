'use client'

import { useState, useEffect, useCallback } from 'react'
import { RefreshCw, Users, Briefcase, Shield, Link2, Hash, FileText } from 'lucide-react'

interface Stats {
  totais: {
    apenados: number
    faccoes: number
    advogados: number
    vinculosAdvogados: number
    vulgos: number
    processos: number
    visitantes: number
  }
  porFaccao: Array<{ nome: string; sigla: string | null; cor: string; total: number }>
  porRegime: Array<{ regime: string | null; total: number }>
  porSituacao: Array<{ situacao: string | null; total: number }>
  porMotivo: Array<{ motivo: string | null; total: number }>
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

export function AIPDashboard() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)

  const fetch_ = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/aip/stats')
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

  const { totais, porFaccao, porRegime, porSituacao, porMotivo } = stats
  const maxFaccao = Math.max(...porFaccao.map((f) => f.total), 1)
  const maxRegime = Math.max(...porRegime.map((r) => r.total), 1)
  const maxSituacao = Math.max(...porSituacao.map((s) => s.total), 1)
  const maxMotivo = Math.max(...porMotivo.map((m) => m.total), 1)

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-4">
        <StatCard icon={Users}     label="Apenados cadastrados" value={totais.apenados}          color="bg-red-500" />
        <StatCard icon={Shield}    label="Facções identificadas" value={totais.faccoes}           color="bg-purple-600" />
        <StatCard icon={Briefcase} label="Advogados vinculados"  value={totais.advogados}         color="bg-blue-600" />
        <StatCard icon={Link2}     label="Vínculos advogados"    value={totais.vinculosAdvogados} color="bg-cyan-600" />
        <StatCard icon={Hash}      label="Vulgos registrados"    value={totais.vulgos}            color="bg-orange-500" />
        <StatCard icon={FileText}  label="Processos criminais"   value={totais.processos}         color="bg-gray-600" />
        <StatCard icon={Link2}     label="Fotos de visitantes"   value={totais.visitantes}        color="bg-teal-600" />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
        {/* Por Facção */}
        <div className="lg:col-span-1 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4 flex items-center gap-2">
            <Shield className="w-4 h-4" /> Apenados por Facção (INTELIGÊNCIA AIP)
          </h3>
          {porFaccao.length === 0 ? (
            <p className="text-sm text-gray-400">Nenhuma facção identificada</p>
          ) : (
            <div className="space-y-3">
              {porFaccao.slice(0, 8).map((f) => (
                <HorizontalBar
                  key={f.nome}
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

        {/* Por Motivo da Última Movimentação */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4 flex items-center gap-2">
            <FileText className="w-4 h-4" /> Motivo da Última Movimentação
          </h3>
          {porMotivo.length === 0 ? (
            <p className="text-sm text-gray-400">Sem dados</p>
          ) : (
            <div className="space-y-3">
              {porMotivo.slice(0, 8).map((m) => (
                <HorizontalBar
                  key={m.motivo ?? 'desconhecido'}
                  label={m.motivo ?? 'Não informado'}
                  value={m.total}
                  max={maxMotivo}
                  color="#f59e0b"
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
