'use client'

import { useEffect, useState } from 'react'
import { Loader2, CheckCircle, XCircle } from 'lucide-react'

interface ApprovalPanelProps {
  refreshTrigger: number
  onApprovalComplete: () => void
}

export function ApprovalPanel({ refreshTrigger, onApprovalComplete }: ApprovalPanelProps) {
  const [solicitacoes, setSolicitacoes] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [processando, setProcessando] = useState<string | null>(null)

  useEffect(() => {
    async function loadRequests() {
      setLoading(true)
      try {
        const res = await fetch('/api/events/deletion-requests')
        const data = await res.json()
        setSolicitacoes(data.solicitacoes || [])
      } catch (err) {
        console.error('Erro ao carregar solicitações:', err)
      } finally {
        setLoading(false)
      }
    }

    loadRequests()
  }, [refreshTrigger])

  const handleApprove = async (id: string) => {
    setProcessando(id)
    try {
      await fetch('/api/events/deletion-requests', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, acao: 'approve' }),
      })
      onApprovalComplete()
    } finally {
      setProcessando(null)
    }
  }

  const handleReject = async (id: string) => {
    setProcessando(id)
    try {
      await fetch('/api/events/deletion-requests', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, acao: 'reject' }),
      })
      onApprovalComplete()
    } finally {
      setProcessando(null)
    }
  }

  if (loading) {
    return <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin" /></div>
  }

  return (
    <div className="space-y-3">
      <h3 className="font-semibold text-gray-900 dark:text-white">Solicitações Pendentes</h3>
      {solicitacoes.length === 0 ? (
        <div className="text-center py-8 text-gray-500">Nenhuma solicitação pendente</div>
      ) : (
        solicitacoes.map((sol) => (
          <div key={sol.id} className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg">
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
              <strong>{sol.solicitadoByUser?.name}</strong> solicitou deleção
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => handleApprove(sol.id)}
                disabled={processando === sol.id}
                className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <CheckCircle className="w-4 h-4" />
                Aprovar
              </button>
              <button
                onClick={() => handleReject(sol.id)}
                disabled={processando === sol.id}
                className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <XCircle className="w-4 h-4" />
                Rejeitar
              </button>
            </div>
          </div>
        ))
      )}
    </div>
  )
}
