'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, Save, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { COMARCAS_RO, type UnidadeEndereco } from '@/lib/unidades-enderecos-ro'
import { UnidadeGeoPicker } from './UnidadeGeoPicker'

interface Props {
  unidade: UnidadeEndereco
  isAdmin: boolean
  comarcas: string[]
  onClose: () => void
  onSaved: (unidade: UnidadeEndereco, pendente?: boolean) => void
}

export function UnidadeEditarModal({ unidade, isAdmin, comarcas, onClose, onSaved }: Props) {
  const [mounted, setMounted] = useState(false)
  const [comarca, setComarca] = useState(unidade.comarca)
  const [nome, setNome] = useState(unidade.unidade)
  const [endereco, setEndereco] = useState(unidade.endereco)
  const [cep, setCep] = useState(unidade.cep)
  const [latitude, setLatitude] = useState<number | null>(unidade.latitude ?? null)
  const [longitude, setLongitude] = useState<number | null>(unidade.longitude ?? null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  useEffect(() => {
    setComarca(unidade.comarca)
    setNome(unidade.unidade)
    setEndereco(unidade.endereco)
    setCep(unidade.cep)
    setLatitude(unidade.latitude ?? null)
    setLongitude(unidade.longitude ?? null)
  }, [unidade])

  const salvar = async () => {
    setSaving(true)
    try {
      const payload = { comarca, unidade: nome, endereco, cep, latitude, longitude }
      const url = isAdmin
        ? `/api/unidades-enderecos/${unidade.id}`
        : `/api/unidades-enderecos/${unidade.id}/solicitar`
      const method = isAdmin ? 'PUT' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Falha ao salvar')

      if (isAdmin) {
        toast.success('Unidade atualizada')
        onSaved(data.unidade)
      } else {
        toast.success('Alteração enviada para aprovação do administrador')
        onSaved({ ...data.unidade, alteracaoPendente: true }, true)
      }
      onClose()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  const opcoesComarca = [...new Set([...COMARCAS_RO, ...comarcas, comarca])].sort()

  if (!mounted) return null

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div
        className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col isolate"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 shrink-0">
          <div>
            <h3 className="font-bold text-gray-900 dark:text-white">Editar unidade</h3>
            <p className="text-[10px] text-subtle mt-0.5">
              {isAdmin
                ? 'Alterações aplicadas imediatamente'
                : 'Suas alterações precisam de aprovação de um administrador'}
            </p>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-subtle">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          <label className="block">
            <span className="text-xs font-semibold text-subtle">Comarca</span>
            <select
              value={comarca}
              onChange={(e) => setComarca(e.target.value)}
              className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"
            >
              {opcoesComarca.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-xs font-semibold text-subtle">Nome da unidade</span>
            <textarea
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              rows={2}
              className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 resize-none"
            />
          </label>

          <label className="block">
            <span className="text-xs font-semibold text-subtle">Endereço</span>
            <textarea
              value={endereco}
              onChange={(e) => setEndereco(e.target.value)}
              rows={2}
              className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 resize-none"
            />
          </label>

          <label className="block">
            <span className="text-xs font-semibold text-subtle">CEP</span>
            <input
              value={cep}
              onChange={(e) => setCep(e.target.value)}
              placeholder="00000-000"
              className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 font-mono"
            />
          </label>

          <UnidadeGeoPicker
            latitude={latitude}
            longitude={longitude}
            onChange={(lat, lng) => {
              setLatitude(lat)
              setLongitude(lng)
            }}
          />
        </div>

        <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex gap-2 shrink-0">
          <button type="button" onClick={onClose} className="btn-secondary flex-1 text-sm">
            Cancelar
          </button>
          <button type="button" onClick={salvar} disabled={saving} className="btn-primary flex-1 text-sm gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {isAdmin ? 'Salvar' : 'Enviar para aprovação'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}