'use client'

import { useCallback, useEffect, useState } from 'react'
import { CheckCircle, XCircle, Clock, Loader2, ChevronDown, ChevronUp, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { formatCep } from '@/lib/unidades-enderecos-ro'
import type { UnidadeEndereco } from '@/lib/unidades-enderecos-ro'

interface Solicitacao {
  id: string
  unidadeId: string
  comarca: string
  unidade: string
  endereco: string
  cep: string
  latitude: number | null
  longitude: number | null
  solicitadoEm: string
  solicitadoPor: { name: string; email: string }
  unidadeAtual?: UnidadeEndereco
}

interface NovaUnidade {
  id: string
  comarca: string
  unidade: string
  endereco: string
  cep: string
  latitude: number | null
  longitude: number | null
  criadoEm: string
  criadoPor: { name: string; email: string }
}

interface Props {
  onResolved: () => void
}

function CampoDiff({ label, antes, depois }: { label: string; antes: string; depois: string }) {
  if (antes === depois) return null
  return (
    <div className="text-xs">
      <p className="text-[10px] font-bold uppercase text-subtle">{label}</p>
      <p className="line-through text-gray-400 truncate">{antes || '—'}</p>
      <p className="font-semibold text-emerald-700 dark:text-emerald-400 truncate">{depois}</p>
    </div>
  )
}

export function UnidadesEnderecosAprovacao({ onResolved }: Props) {
  const [solicitacoes, setSolicitacoes] = useState<Solicitacao[]>([])
  const [novasUnidades, setNovasUnidades] = useState<NovaUnidade[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [processing, setProcessing] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/unidades-enderecos/solicitacoes')
      if (res.ok) {
        const data = await res.json()
        setSolicitacoes(data.solicitacoes ?? [])
        setNovasUnidades(data.novasUnidades ?? [])
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { carregar() }, [carregar])

  const revisarAlteracao = async (id: string, acao: 'APROVAR' | 'REJEITAR') => {
    let motivo: string | undefined
    if (acao === 'REJEITAR') {
      motivo = window.prompt('Motivo da rejeição (opcional):') ?? undefined
      if (motivo === null) return
    }

    setProcessing(id)
    try {
      const res = await fetch(`/api/unidades-enderecos/solicitacoes/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acao, motivo }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Falha')
      toast.success(acao === 'APROVAR' ? 'Alteração aprovada' : 'Alteração rejeitada')
      setSolicitacoes((prev) => prev.filter((s) => s.id !== id))
      onResolved()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro')
    } finally {
      setProcessing(null)
    }
  }

  const revisarNova = async (id: string, acao: 'APROVAR' | 'REJEITAR') => {
    let motivo: string | undefined
    if (acao === 'REJEITAR') {
      motivo = window.prompt('Motivo da rejeição (opcional):') ?? undefined
      if (motivo === null) return
    }

    setProcessing(id)
    try {
      const res = await fetch(`/api/unidades-enderecos/novas/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acao, motivo }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Falha')
      toast.success(acao === 'APROVAR' ? 'Nova unidade aprovada' : 'Nova unidade rejeitada')
      setNovasUnidades((prev) => prev.filter((s) => s.id !== id))
      onResolved()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro')
    } finally {
      setProcessing(null)
    }
  }

  const total = solicitacoes.length + novasUnidades.length

  if (loading) {
    return (
      <p className="text-xs text-subtle flex items-center gap-2 px-4 py-2">
        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Carregando solicitações...
      </p>
    )
  }

  if (total === 0) return null

  return (
    <div className="mx-4 md:mx-6 mb-3 rounded-xl border border-amber-300/60 dark:border-amber-700/50 bg-amber-50/80 dark:bg-amber-950/20 overflow-hidden">
      <div className="px-3 py-2 flex items-center gap-2 border-b border-amber-200/60 dark:border-amber-800/40">
        <Clock className="w-4 h-4 text-amber-600" />
        <p className="text-xs font-bold text-amber-900 dark:text-amber-200">
          {total} pendência{total !== 1 ? 's' : ''} aguardando aprovação
        </p>
      </div>
      <div className="divide-y divide-amber-200/40 dark:divide-amber-800/30 max-h-80 overflow-y-auto">
        {novasUnidades.map((s) => {
          const aberto = expanded === `nova-${s.id}`
          return (
            <div key={s.id} className="p-3">
              <button
                type="button"
                onClick={() => setExpanded(aberto ? null : `nova-${s.id}`)}
                className="w-full flex items-start justify-between gap-2 text-left"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <Plus className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <p className="text-[10px] font-bold uppercase text-emerald-700 dark:text-emerald-400">Nova unidade</p>
                  </div>
                  <p className="text-sm font-bold text-gray-900 dark:text-white truncate mt-0.5">{s.unidade}</p>
                  <p className="text-[10px] text-subtle">
                    {s.comarca} · por {s.criadoPor.name}
                  </p>
                </div>
                {aberto ? <ChevronUp className="w-4 h-4 shrink-0" /> : <ChevronDown className="w-4 h-4 shrink-0" />}
              </button>

              {aberto && (
                <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  <div><p className="text-[10px] font-bold uppercase text-subtle">Comarca</p><p className="font-semibold">{s.comarca}</p></div>
                  <div><p className="text-[10px] font-bold uppercase text-subtle">CEP</p><p className="font-semibold font-mono">{formatCep(s.cep) || '—'}</p></div>
                  <div className="sm:col-span-2"><p className="text-[10px] font-bold uppercase text-subtle">Endereço</p><p className="font-semibold">{s.endereco}</p></div>
                  <div className="sm:col-span-2">
                    <p className="text-[10px] font-bold uppercase text-subtle">Coordenadas</p>
                    <p className="font-semibold font-mono">
                      {s.latitude != null ? `${s.latitude}, ${s.longitude}` : 'Não definidas'}
                    </p>
                  </div>
                </div>
              )}

              <div className="flex gap-2 mt-3">
                <button
                  type="button"
                  disabled={processing === s.id}
                  onClick={() => revisarNova(s.id, 'APROVAR')}
                  className="btn-primary text-xs flex-1 gap-1.5"
                >
                  {processing === s.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
                  Aprovar
                </button>
                <button
                  type="button"
                  disabled={processing === s.id}
                  onClick={() => revisarNova(s.id, 'REJEITAR')}
                  className="btn-secondary text-xs flex-1 gap-1.5 text-red-600"
                >
                  <XCircle className="w-3.5 h-3.5" /> Rejeitar
                </button>
              </div>
            </div>
          )
        })}

        {solicitacoes.map((s) => {
          const atual = s.unidadeAtual
          const aberto = expanded === s.id
          return (
            <div key={s.id} className="p-3">
              <button
                type="button"
                onClick={() => setExpanded(aberto ? null : s.id)}
                className="w-full flex items-start justify-between gap-2 text-left"
              >
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase text-subtle">Alteração</p>
                  <p className="text-sm font-bold text-gray-900 dark:text-white truncate">{s.unidade}</p>
                  <p className="text-[10px] text-subtle">
                    {s.comarca} · por {s.solicitadoPor.name}
                  </p>
                </div>
                {aberto ? <ChevronUp className="w-4 h-4 shrink-0" /> : <ChevronDown className="w-4 h-4 shrink-0" />}
              </button>

              {aberto && atual && (
                <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <CampoDiff label="Comarca" antes={atual.comarca} depois={s.comarca} />
                  <CampoDiff label="Unidade" antes={atual.unidade} depois={s.unidade} />
                  <CampoDiff label="Endereço" antes={atual.endereco} depois={s.endereco} />
                  <CampoDiff label="CEP" antes={formatCep(atual.cep)} depois={formatCep(s.cep)} />
                  <CampoDiff
                    label="Coordenadas"
                    antes={
                      atual.latitude != null
                        ? `${atual.latitude}, ${atual.longitude}`
                        : 'Não definidas'
                    }
                    depois={
                      s.latitude != null ? `${s.latitude}, ${s.longitude}` : 'Não definidas'
                    }
                  />
                </div>
              )}

              <div className="flex gap-2 mt-3">
                <button
                  type="button"
                  disabled={processing === s.id}
                  onClick={() => revisarAlteracao(s.id, 'APROVAR')}
                  className="btn-primary text-xs flex-1 gap-1.5"
                >
                  {processing === s.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
                  Aprovar
                </button>
                <button
                  type="button"
                  disabled={processing === s.id}
                  onClick={() => revisarAlteracao(s.id, 'REJEITAR')}
                  className="btn-secondary text-xs flex-1 gap-1.5 text-red-600"
                >
                  <XCircle className="w-3.5 h-3.5" /> Rejeitar
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}