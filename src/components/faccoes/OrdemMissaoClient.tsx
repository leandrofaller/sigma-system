'use client'

import { useEffect, useState } from 'react'
import { ClipboardList, AlertTriangle, ArrowRight, Clock } from 'lucide-react'
import { OrdemMissaoPanel } from './OrdemMissaoPanel'

interface Props {
  userRole: string
  userId: string
  userName: string
}

interface OrdemProxima {
  id: string
  numero: string
  titulo: string
  prazo: string
}

function formatTimeLeft(prazo: string): string {
  const diff = new Date(prazo).getTime() - Date.now()
  const totalMinutes = Math.floor(diff / 60000)
  if (totalMinutes < 60) return `${totalMinutes} minuto${totalMinutes !== 1 ? 's' : ''}`
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (minutes === 0) return `${hours}h`
  return `${hours}h ${minutes}min`
}

export function OrdemMissaoClient({ userRole, userId, userName }: Props) {
  const [pendentes, setPendentes] = useState(0)
  const [ordensProximas, setOrdensProximas] = useState<OrdemProxima[]>([])

  useEffect(() => {
    fetch('/api/aip/ordens-missao/pendentes-ciencia')
      .then(r => r.ok ? r.json() : { count: 0 })
      .then(d => setPendentes(d.count ?? 0))
      .catch(() => {})

    fetch('/api/aip/ordens-missao/prazo-proximo')
      .then(r => r.ok ? r.json() : { ordens: [] })
      .then(d => setOrdensProximas(d.ordens ?? []))
      .catch(() => {})
  }, [])

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="px-4 md:px-6 py-3.5 md:py-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
            <ClipboardList className="w-5 h-5 text-purple-600 dark:text-purple-400" />
          </div>
          <div className="flex-1">
            <h1 className="text-lg md:text-xl font-bold text-gray-900 dark:text-white">
              Ordens de Missão
            </h1>
            <p className="text-xs md:text-sm text-gray-500 dark:text-gray-400">
              Emissão e controle de ordens com ciência digital dos agentes
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap justify-end">
            {ordensProximas.length > 0 && (
              <div className="flex items-center gap-2 bg-red-600 text-white text-xs font-bold px-3 py-1.5 rounded-full animate-pulse">
                <Clock className="w-3.5 h-3.5" />
                {ordensProximas.length} prazo{ordensProximas.length > 1 ? 's' : ''} crítico{ordensProximas.length > 1 ? 's' : ''}
              </div>
            )}
            {pendentes > 0 && (
              <div className="flex items-center gap-2 bg-amber-500 text-white text-xs font-bold px-3 py-1.5 rounded-full animate-pulse">
                <AlertTriangle className="w-3.5 h-3.5" />
                {pendentes} ciência{pendentes > 1 ? 's' : ''} pendente{pendentes > 1 ? 's' : ''}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Banner prazo crítico (≤ 24h) */}
      {ordensProximas.length > 0 && (
        <div className="mx-3 md:mx-6 mt-3 rounded-xl border border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/20 overflow-hidden">
          <div className="flex items-center gap-3 px-4 py-3 border-b border-red-200 dark:border-red-800">
            <div className="p-2 bg-red-100 dark:bg-red-900/40 rounded-lg shrink-0">
              <Clock className="w-4 h-4 text-red-600 dark:text-red-400" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-bold text-red-800 dark:text-red-300">
                Atenção! {ordensProximas.length > 1 ? `${ordensProximas.length} ordens vencem` : 'Uma ordem vence'} nas próximas 24 horas
              </p>
              <p className="text-xs text-red-600 dark:text-red-400 mt-0.5">
                Cumpra a missão antes do prazo para não incorrer em descumprimento
              </p>
            </div>
          </div>
          <div className="divide-y divide-red-100 dark:divide-red-900/40">
            {ordensProximas.map(o => (
              <div key={o.id} className="flex items-center justify-between px-4 py-2.5 gap-3">
                <div className="flex-1 min-w-0">
                  <span className="text-xs font-mono text-red-500 dark:text-red-400">{o.numero}</span>
                  <p className="text-sm font-semibold text-red-900 dark:text-red-200 truncate">{o.titulo}</p>
                </div>
                <div className="shrink-0 text-right">
                  <span className="inline-flex items-center gap-1 text-xs font-bold text-white bg-red-600 px-2.5 py-1 rounded-lg">
                    <Clock className="w-3 h-3" />
                    {formatTimeLeft(o.prazo)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Banner de alerta quando há ciências pendentes */}
      {pendentes > 0 && (
        <div className="mx-3 md:mx-6 mt-3 flex items-center gap-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-700 rounded-xl px-4 py-3">
          <div className="p-2 bg-amber-100 dark:bg-amber-900/40 rounded-lg shrink-0">
            <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-bold text-amber-800 dark:text-amber-300">
              Você possui {pendentes} ordem{pendentes > 1 ? 'ns' : ''} de missão aguardando sua ciência
            </p>
            <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">
              Clique na ordem destacada abaixo para ler e confirmar o recebimento
            </p>
          </div>
          <ArrowRight className="w-4 h-4 text-amber-500 shrink-0" />
        </div>
      )}

      {/* Content */}
      <div className="flex-1 min-h-0 p-3 md:p-6 overflow-y-auto">
        <OrdemMissaoPanel
          userRole={userRole}
          currentUserId={userId}
          currentUserName={userName}
        />
      </div>
    </div>
  )
}
