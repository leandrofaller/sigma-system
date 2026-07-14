'use client'

import { useEffect, useState } from 'react'
import { CheckCircle2, XCircle, Clock, Search, ShieldAlert, FileText, User } from 'lucide-react'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

interface DossierRequest {
  id: string
  apenadoId: string
  status: 'PENDING' | 'APPROVED' | 'REJECTED'
  reason: string
  createdAt: string
  updatedAt: string
  user: {
    name: string
    email: string
  }
  apenado: {
    nome: string
    cpf?: string | null
  }
  approvedBy?: {
    name: string
  } | null
}

export function AIPDossierRequestsPanel() {
  const [requests, setRequests] = useState<DossierRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterStatus, setFilterStatus] = useState<string>('ALL')

  const fetchRequests = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/aip/dossier/request')
      if (!res.ok) throw new Error('Falha ao carregar solicitações')
      const data = await res.json()
      setRequests(data)
    } catch (err: any) {
      console.error(err)
      toast.error('Erro ao carregar solicitações de dossiê.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchRequests()
  }, [])

  const handleUpdateStatus = async (id: string, status: 'APPROVED' | 'REJECTED') => {
    const toastId = toast.loading(status === 'APPROVED' ? 'Aprovando solicitação...' : 'Rejeitando solicitação...')
    try {
      const res = await fetch(`/api/aip/dossier/request/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      })

      if (!res.ok) {
        const errData = await res.json()
        throw new Error(errData.error || 'Erro na requisição')
      }

      toast.success(status === 'APPROVED' ? 'Solicitação aprovada!' : 'Solicitação rejeitada!', { id: toastId })
      
      // Atualizar lista localmente
      setRequests(prev => prev.map(r => r.id === id ? { ...r, status, approvedBy: { name: 'Você' } } : r))
    } catch (err: any) {
      console.error(err)
      toast.error(err.message || 'Erro ao processar ação.', { id: toastId })
    }
  }

  const filteredRequests = requests.filter(r => {
    const matchesSearch = 
      r.user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.apenado.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (r.reason && r.reason.toLowerCase().includes(searchTerm.toLowerCase()))
    
    if (filterStatus === 'ALL') return matchesSearch
    return r.status === filterStatus && matchesSearch
  })

  return (
    <div className="space-y-6 h-full flex flex-col min-h-0">
      {/* Controles de busca e filtro */}
      <div className="flex flex-col sm:flex-row gap-4 justify-between items-center bg-white dark:bg-gray-900 p-4 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 shrink-0">
        <div className="relative w-full sm:max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-subtle" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por usuário, apenado ou justificativa..."
            className="w-full input-base pl-10 pr-4 py-2 text-sm"
          />
        </div>

        <div className="flex gap-2 w-full sm:w-auto">
          {['ALL', 'PENDING', 'APPROVED', 'REJECTED'].map((status) => (
            <button
              key={status}
              onClick={() => setFilterStatus(status)}
              className={`flex-1 sm:flex-initial px-3 py-1.5 rounded-xl text-xs font-bold transition-all border
                ${filterStatus === status
                  ? 'bg-sigma-600 border-sigma-500 text-white shadow-md shadow-sigma-600/10'
                  : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-subtle hover:border-sigma-400'
                }`}
            >
              {status === 'ALL' && 'Todas'}
              {status === 'PENDING' && 'Pendentes'}
              {status === 'APPROVED' && 'Aprovadas'}
              {status === 'REJECTED' && 'Rejeitadas'}
            </button>
          ))}
        </div>
      </div>

      {/* Lista/Tabela */}
      <div className="flex-1 min-h-0 overflow-y-auto bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 shadow-sm p-2 sm:p-4">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 text-subtle gap-2">
            <div className="w-8 h-8 rounded-full border-4 border-sigma-200 border-t-sigma-600 animate-spin" />
            <span className="text-sm font-semibold">Carregando solicitações...</span>
          </div>
        ) : filteredRequests.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-subtle gap-3">
            <ShieldAlert className="w-12 h-12 text-gray-300 dark:text-gray-700" />
            <span className="text-sm font-semibold">Nenhuma solicitação encontrada.</span>
          </div>
        ) : (
          <div className="grid gap-4">
            {filteredRequests.map((req) => (
              <div
                key={req.id}
                className={`p-4 rounded-2xl border transition-all flex flex-col md:flex-row justify-between gap-4 items-start md:items-center
                  ${req.status === 'PENDING'
                    ? 'border-amber-200 bg-amber-50/10 dark:border-amber-900/30'
                    : req.status === 'APPROVED'
                    ? 'border-green-200 bg-green-50/5 dark:border-green-900/10'
                    : 'border-red-200 bg-red-50/5 dark:border-red-900/10'
                  }`}
              >
                <div className="space-y-2 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1 text-xs font-bold text-gray-700 dark:text-gray-300">
                      <User className="w-3.5 h-3.5 text-sigma-500" />
                      {req.user.name}
                    </span>
                    <span className="text-xs text-subtle">•</span>
                    <span className="inline-flex items-center gap-1 text-xs font-bold text-gray-700 dark:text-gray-300">
                      <FileText className="w-3.5 h-3.5 text-purple-500" />
                      Apenado: <span className="font-semibold text-sigma-600 dark:text-sigma-400">{req.apenado.nome}</span>
                    </span>
                    <span className="text-xs text-subtle">•</span>
                    <span className="text-[10px] text-subtle font-mono">
                      {format(new Date(req.createdAt), 'dd/MM/yyyy HH:mm', { locale: ptBR })}
                    </span>
                  </div>

                  <div className="p-3 bg-gray-50 dark:bg-gray-800/40 rounded-xl border border-gray-100 dark:border-gray-800 text-xs md:text-sm text-body italic">
                    &ldquo;{req.reason}&rdquo;
                  </div>

                  {req.status !== 'PENDING' && req.approvedBy && (
                    <p className="text-[10px] text-subtle">
                      Processada por: <span className="font-bold">{req.approvedBy.name}</span>
                    </p>
                  )}
                </div>

                <div className="flex gap-2 shrink-0 w-full md:w-auto justify-end">
                  {req.status === 'PENDING' ? (
                    <>
                      <button
                        onClick={() => handleUpdateStatus(req.id, 'APPROVED')}
                        className="flex-1 md:flex-initial bg-green-600 hover:bg-green-700 text-white text-xs px-4 py-2.5 rounded-xl font-bold shadow-md shadow-green-600/15 transition-all flex items-center justify-center gap-1.5 active:scale-95"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        Autorizar
                      </button>
                      <button
                        onClick={() => handleUpdateStatus(req.id, 'REJECTED')}
                        className="flex-1 md:flex-initial bg-white hover:bg-red-50 text-red-600 border border-red-200 hover:border-red-300 text-xs px-4 py-2.5 rounded-xl font-bold transition-all flex items-center justify-center gap-1.5 active:scale-95 dark:bg-gray-800 dark:hover:bg-red-950/20 dark:border-red-900/30"
                      >
                        <XCircle className="w-4 h-4" />
                        Rejeitar
                      </button>
                    </>
                  ) : (
                    <div className="flex items-center gap-1 text-xs font-bold">
                      {req.status === 'APPROVED' ? (
                        <span className="text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-950/20 px-3 py-1.5 rounded-xl border border-green-200 dark:border-green-900/30 flex items-center gap-1.5">
                          <CheckCircle2 className="w-4 h-4" />
                          Aprovada
                        </span>
                      ) : (
                        <span className="text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/20 px-3 py-1.5 rounded-xl border border-red-200 dark:border-red-900/30 flex items-center gap-1.5">
                          <XCircle className="w-4 h-4" />
                          Rejeitada
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
