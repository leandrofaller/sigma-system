'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, Save, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { COMARCAS_RO, type UnidadeEndereco } from '@/lib/unidades-enderecos-ro'
import { UnidadeGeoPicker } from './UnidadeGeoPicker'

const UNIDADE_VAZIA: UnidadeEndereco = {
  id: '',
  comarca: COMARCAS_RO[0] ?? '',
  unidade: '',
  endereco: '',
  cep: '',
  latitude: null,
  longitude: null,
}

interface Props {
  /** Omitir para modo criação de nova unidade. */
  unidade?: UnidadeEndereco
  isAdmin: boolean
  comarcas: string[]
  onClose: () => void
  onSaved: (unidade: UnidadeEndereco, pendente?: boolean) => void
}

export function UnidadeEditarModal({ unidade, isAdmin, comarcas, onClose, onSaved }: Props) {
  const isCreate = !unidade?.id
  const base = unidade ?? UNIDADE_VAZIA

  const [mounted, setMounted] = useState(false)
  const [comarca, setComarca] = useState(base.comarca)
  const [nome, setNome] = useState(base.unidade)
  const [endereco, setEndereco] = useState(base.endereco)
  const [cep, setCep] = useState(base.cep)
  const [latitude, setLatitude] = useState<number | null>(base.latitude ?? null)
  const [longitude, setLongitude] = useState<number | null>(base.longitude ?? null)
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
    if (!unidade) return
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

      let url: string
      let method: string

      if (isCreate) {
        url = '/api/unidades-enderecos'
        method = 'POST'
      } else if (isAdmin) {
        url = `/api/unidades-enderecos/${unidade!.id}`
        method = 'PUT'
      } else {
        url = `/api/unidades-enderecos/${unidade!.id}/solicitar`
        method = 'POST'
      }

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Falha ao salvar')

      if (isCreate) {
        if (data.pendente) {
          toast.success('Nova unidade enviada para aprovação do administrador')
          onSaved({ ...data.unidade, alteracaoPendente: true }, true)
        } else {
          toast.success('Nova unidade criada')
          onSaved(data.unidade)
        }
      } else if (isAdmin) {
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

  const opcoesComarca = [...new Set([...COMARCAS_RO, ...comarcas, comarca].filter(Boolean))].sort()
  const comarcaListId = isCreate ? 'comarcas-nova-unidade' : 'comarcas-editar-unidade'

  if (!mounted) return null

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div
        className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col isolate"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 shrink-0">
          <div>
            <h3 className="font-bold text-gray-900 dark:text-white">
              {isCreate ? 'Nova unidade prisional' : 'Editar unidade'}
            </h3>
            <p className="text-[10px] text-subtle mt-0.5">
              {isCreate
                ? isAdmin
                  ? 'A unidade será adicionada à lista imediatamente'
                  : 'A criação precisa de aprovação de um administrador'
                : isAdmin
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
            <input
              list={comarcaListId}
              value={comarca}
              onChange={(e) => setComarca(e.target.value)}
              placeholder="Ex.: PORTO VELHO"
              className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"
            />
            <datalist id={comarcaListId}>
              {opcoesComarca.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </label>

          <label className="block">
            <span className="text-xs font-semibold text-subtle">Nome da unidade</span>
            <textarea
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              rows={2}
              placeholder="Nome oficial da unidade prisional"
              className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 resize-none"
            />
          </label>

          <label className="block">
            <span className="text-xs font-semibold text-subtle">Endereço</span>
            <textarea
              value={endereco}
              onChange={(e) => setEndereco(e.target.value)}
              rows={2}
              placeholder="Logradouro, número, bairro..."
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
            {isCreate
              ? isAdmin ? 'Criar unidade' : 'Enviar para aprovação'
              : isAdmin ? 'Salvar' : 'Enviar para aprovação'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}