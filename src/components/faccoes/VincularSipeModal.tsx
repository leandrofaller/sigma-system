'use client'

import { useState, useEffect } from 'react'
import { X, Link2, Search, Loader2, CheckCircle2, User, Building2, MapPin } from 'lucide-react'
import { toast } from 'sonner'

interface VincularSipeModalProps {
  isOpen: boolean
  onClose: () => void
  aipApenado: { id: string; nome: string; vulgo?: string | null; cpf?: string | null } | null
  onSuccess: (updatedApenado: any) => void
}

export function VincularSipeModal({
  isOpen,
  onClose,
  aipApenado,
  onSuccess
}: VincularSipeModalProps) {
  const [query, setQuery] = useState('')
  const [buscando, setBuscando] = useState(false)
  const [vinculando, setVinculando] = useState(false)
  const [candidatos, setCandidatos] = useState<any[]>([])
  const [selecionado, setSelecionado] = useState<any | null>(null)

  useEffect(() => {
    if (isOpen && aipApenado) {
      setQuery(aipApenado.nome || aipApenado.cpf || '')
      setSelecionado(null)
    }
  }, [isOpen, aipApenado])

  useEffect(() => {
    if (!query || query.trim().length < 2) {
      setCandidatos([])
      return
    }

    const timer = setTimeout(async () => {
      setBuscando(true)
      try {
        const res = await fetch(`/api/sipe/apenados/search?q=${encodeURIComponent(query.trim())}`)
        const data = await res.json()
        if (res.ok && data.apenados) {
          setCandidatos(data.apenados)
        }
      } catch (err) {
        console.error('Erro na busca SIPE:', err)
      } finally {
        setBuscando(false)
      }
    }, 300)

    return () => clearTimeout(timer)
  }, [query])

  if (!isOpen || !aipApenado) return null

  const handleConfirmarVinculo = async () => {
    if (!selecionado) {
      toast.error('Selecione um apenado do SIPE para vincular')
      return
    }

    setVinculando(true)
    const toastId = toast.loading(`Vinculando ${aipApenado.nome} ao SIPE ID #${selecionado.sipeId}...`)

    try {
      const res = await fetch(`/api/aip/apenados/${aipApenado.id}/link-sipe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetSipeId: selecionado.sipeId }),
      })

      const data = await res.json()

      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Erro ao vincular com SIPE')
      }

      toast.success(data.message || 'Cadastro vinculado ao SIPE com sucesso!', { id: toastId })
      onSuccess(data.apenado)
      onClose()
    } catch (err: any) {
      console.error(err)
      toast.error(err.message || 'Erro ao vincular ao SIPE', { id: toastId })
    } finally {
      setVinculando(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md overflow-y-auto">
      <div className="relative w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/80">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-500/10 border border-blue-500/20 rounded-xl text-blue-400">
              <Link2 className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                Vincular Cadastro AIP ao SIPE
              </h2>
              <p className="text-xs text-slate-400">
                Pessoa atual: <strong className="text-white">{aipApenado.nome}</strong> {aipApenado.vulgo ? `(${aipApenado.vulgo})` : ''}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          <div className="relative">
            <Search className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Digite nome, CPF ou RJI para pesquisar no SIPE..."
              className="w-full pl-10 pr-4 py-2.5 bg-slate-950 border border-slate-700/80 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
            />
            {buscando && (
              <Loader2 className="absolute right-3.5 top-3 w-4 h-4 text-blue-400 animate-spin" />
            )}
          </div>

          {/* Candidatos List */}
          <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
            {candidatos.length === 0 && !buscando && query.trim().length >= 2 && (
              <div className="text-center py-8 text-slate-500 text-sm">
                Nenhum apenado encontrado no SIPE com esse critério de busca.
              </div>
            )}

            {candidatos.map((c) => {
              const isSelected = selecionado?.sipeId === c.sipeId
              return (
                <div
                  key={c.sipeId}
                  onClick={() => setSelecionado(c)}
                  className={`flex items-center gap-4 p-3 rounded-xl border transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-blue-600/15 border-blue-500/50 shadow-lg shadow-blue-900/20'
                      : 'bg-slate-950/60 border-slate-800/80 hover:bg-slate-800/50'
                  }`}
                >
                  <div className="w-12 h-14 bg-slate-900 rounded-lg overflow-hidden flex-shrink-0 flex items-center justify-center border border-slate-700/50">
                    {c.photoPath ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={`/${c.photoPath}`} alt={c.nome} className="w-full h-full object-cover" />
                    ) : (
                      <User className="w-6 h-6 text-slate-600" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-semibold text-white truncate">{c.nome}</h4>
                      <span className="text-xs font-mono text-blue-400 bg-blue-950/60 px-2 py-0.5 rounded border border-blue-900/50">
                        SIPE #{c.sipeId}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs text-slate-400">
                      {c.cpf && <span>CPF: {c.cpf}</span>}
                      {c.rji && <span>RJI: {c.rji}</span>}
                      {c.unidade && (
                        <span className="flex items-center gap-1 text-slate-300">
                          <Building2 className="w-3 h-3 text-slate-500" />
                          {c.unidade} {c.cela ? `(${c.cela})` : ''}
                        </span>
                      )}
                      {c.situacao && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-800 text-slate-300">
                          {c.situacao}
                        </span>
                      )}
                    </div>
                  </div>

                  {isSelected && (
                    <CheckCircle2 className="w-5 h-5 text-blue-400 flex-shrink-0" />
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-800 bg-slate-900/80">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-xl transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleConfirmarVinculo}
            disabled={!selecionado || vinculando}
            className="flex items-center gap-2 px-5 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-xl shadow-lg shadow-blue-900/30 transition-all active:scale-95"
          >
            {vinculando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
            Confirmar Vinculação ao SIPE
          </button>
        </div>

      </div>
    </div>
  )
}
