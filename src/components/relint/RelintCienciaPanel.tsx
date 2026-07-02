'use client'

import { useState } from 'react'
import { CheckCheck, Check, Loader2, ShieldCheck, User } from 'lucide-react'
import type { RelintCienciaWithUser } from '@/types'

const ROLE_LABEL: Record<string, string> = {
  SUPER_ADMIN: 'Super Admin',
  ADMIN: 'Administrador',
  OPERATOR: 'Operador',
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

interface Props {
  relintId: string
  ciencias: RelintCienciaWithUser[]
  currentUserId: string
  currentUserRole: string
}

export function RelintCienciaPanel({ relintId, ciencias: initialCiencias, currentUserId, currentUserRole }: Props) {
  const [ciencias, setCiencias] = useState<RelintCienciaWithUser[]>(initialCiencias)
  const [loading, setLoading] = useState(false)

  const isAdmin = currentUserRole === 'SUPER_ADMIN' || currentUserRole === 'ADMIN'
  const jaDeuCiencia = ciencias.some(c => c.userId === currentUserId)

  const handleCiencia = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/relints/${relintId}/ciencia`, { method: 'POST' })
      if (!res.ok) {
        const data = await res.json()
        alert(data.error || 'Erro ao registrar ciência')
        return
      }
      const data = await res.json()
      setCiencias(prev => [...prev, data.ciencia])
    } catch {
      alert('Erro ao registrar ciência')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="card overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-sigma-600" />
          <h3 className="font-bold text-title text-sm uppercase tracking-wider">
            Controle de Ciência
          </h3>
        </div>
        <span className="text-xs text-subtle font-medium">
          {ciencias.length} registro{ciencias.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Lista de ciências */}
      {ciencias.length > 0 ? (
        <div className="divide-y divide-gray-100 dark:divide-gray-800">
          {ciencias.map((c, idx) => (
            <div key={c.id} className="flex items-center gap-4 px-6 py-3 bg-emerald-50/40 dark:bg-emerald-900/10">
              <span className="text-xs text-gray-400 w-5 text-center font-mono">{idx + 1}</span>
              <div className="w-9 h-9 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 flex items-center justify-center font-bold text-sm shrink-0">
                {c.user.name.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-title truncate">{c.user.name}</p>
                <p className="text-xs text-subtle">{ROLE_LABEL[c.user.role] || c.user.role}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1 justify-end">
                  <Check className="w-3.5 h-3.5" /> Ciência dada
                </p>
                <p className="text-xs text-subtle mt-0.5">{formatDateTime(c.createdAt as unknown as string)}</p>
                {c.ip && <p className="text-[10px] text-gray-300 dark:text-gray-600 mt-0.5">IP: {c.ip}</p>}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-8 gap-2 text-center">
          <User className="w-8 h-8 text-gray-200 dark:text-gray-700" />
          <p className="text-sm text-subtle">Nenhum administrador deu ciência ainda</p>
        </div>
      )}

      {/* Botão de ciência para admins */}
      {isAdmin && (
        <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between">
          <p className="text-xs text-subtle">
            {jaDeuCiencia
              ? 'Você já registrou sua ciência neste relatório.'
              : 'Ao dar ciência, você confirma que leu e tomou conhecimento deste relatório.'}
          </p>
          <button
            onClick={handleCiencia}
            disabled={jaDeuCiencia || loading}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-xl transition-colors disabled:opacity-60 disabled:cursor-default ${
              jaDeuCiencia
                ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400'
                : 'bg-sigma-600 hover:bg-sigma-700 text-white shadow-sm'
            }`}
          >
            {loading
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : <CheckCheck className="w-4 h-4" />
            }
            {jaDeuCiencia ? 'Ciência Confirmada' : 'Dar Ciência'}
          </button>
        </div>
      )}
    </div>
  )
}
