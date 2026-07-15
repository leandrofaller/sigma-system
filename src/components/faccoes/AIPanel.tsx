'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import { listaEnderecosHrefFromUnidadeAip } from '@/lib/unidades-enderecos-resolver'
import { Search, Brain, Users, Loader2, X, Edit2, Save, ChevronLeft, ChevronRight, Trash2, User, Shield, MapPin, MapPinOff, CheckCircle2, Image, Briefcase, Settings, ArrowUp, ArrowDown, Eye, EyeOff, Paperclip, Download, Link2, RefreshCw, FileText } from 'lucide-react'
import { toast } from 'sonner'
import { useSession } from 'next-auth/react'
import { printAIPDossier } from './AIPDossierPrint'

interface AIPFotoVisitante {
  id: string
  visitanteId: string | null
  nomeVisitante: string | null
  cpfVisitante: string | null
  parentescoVisitante: string | null
  ativoVisitante: boolean | null
  photoPath: string | null
  descricao: string | null
}

export interface AIPApenado {
  id: string
  sipeId: number
  nome: string
  cpf?: string
  unidade?: string
  faccao?: string
  regime?: string
  situacao?: string

  // Novos campos do SIPE importados em AIP
  nomeOutro?: string | null
  rg?: string | null
  rgOrgao?: string | null
  dataNascimento?: string | null
  sexo?: string | null
  etnia?: string | null
  naturalidade?: string | null
  orientacaoSexual?: string | null
  tipoSanguineo?: string | null
  grauInstrucao?: string | null
  religiao?: string | null
  estadoCivil?: string | null
  nomeConjuge?: string | null
  qtdFilhos?: number | null
  nomeMae?: string | null
  nomePai?: string | null
  telefone?: string | null
  rji?: string | null

  // Dados Prisionais
  cela?: string | null
  dataEntrada?: string | null
  dataPrisao?: string | null
  tempoPena?: string | null
  monitorado?: boolean | null
  intramuro?: boolean | null
  presoOriundo?: string | null
  oficioEntrada?: string | null
  celeAtual?: string | null
  ultimaMovimentacao?: string | null

  // Endereço Residencial
  logradouro?: string | null
  numero?: string | null
  complemento?: string | null
  bairro?: string | null
  cidade?: string | null
  uf?: string | null
  cep?: string | null

  photoPath?: string | null
  customPhotoPath?: string | null

  // Inteligência
  facaoRealNome?: string
  facaoNivel?: string
  notasInteligencia?: string
  observacoes?: string
  vulgo?: string | null
  facaoRelevancia?: string | null
  custodiaReal?: string | null

  cadastradoEm: string
  cadastradoPor: string
  cadastradoPorNome?: string | null
  atualizadoEm: string
  atualizadoPor?: string
  atualizadoPorNome?: string | null

  temMapaVinculo?: boolean
  mapaMunicipio?: string | null

  // Relacionamento com visitantes
  fotoVisitantes?: AIPFotoVisitante[]
  sipeApenado?: {
    vinculosAdvogado: Array<{
      advogado: {
        id: string
        nome: string
        oab: string | null
      }
    }>
  }
}

interface AIPApenadoAnexo {
  id: string
  apenadoId: string
  nomeOriginal: string
  nomeS3: string
  tipoMime: string
  tamanhoOriginal: number
  tamanhoS3: number
  urlS3: string
  chaveS3: string
  usuarioUploadId: string
  usuarioUpload: { name: string }
  dataUpload: string
  descricao?: string | null
}

// ── Card de Apenado em AIP ────────
function AIApenadoCard({
  apenado,
  onSelect,
  onViewVinculos,
  onViewMapa,
}: {
  apenado: AIPApenado
  onSelect: (a: AIPApenado) => void
  onViewVinculos?: (sipeId: number) => void
  onViewMapa?: (apenado: AIPApenado) => void
}) {
  const temInteligencia = !!(apenado.facaoRealNome || apenado.notasInteligencia)
  const isFaccaoConfirmada = apenado.facaoRealNome && apenado.facaoNivel === 'confirmado'
  const temVinculos = (apenado as any).temVinculos
  const temMapaVinculo = !!apenado.temMapaVinculo
  const podeMapa = !!(apenado.facaoRealNome || apenado.faccao) && !!apenado.unidade

  return (
    <button
      type="button"
      onClick={() => onSelect(apenado)}
      className={`w-full text-left bg-white dark:bg-gray-800 rounded-xl border p-4 hover:shadow-md transition-all ${
        isFaccaoConfirmada 
          ? 'border-red-300 dark:border-red-900/60 hover:border-red-400 dark:hover:border-red-800 bg-red-50/10 dark:bg-red-950/10'
          : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
      }`}
    >
      <div className="flex items-start gap-3">
        {/* Foto de Perfil */}
        <div className={`w-12 h-12 rounded-xl overflow-hidden flex-shrink-0 flex items-center justify-center font-bold text-white text-lg relative ${
          isFaccaoConfirmada ? 'bg-red-500' : temInteligencia ? 'bg-purple-500' : 'bg-blue-500'
        }`}>
          {(apenado.photoPath || apenado.customPhotoPath) ? (
            <img
              src={`/api/aip/apenados/${apenado.id}/foto`}
              alt={apenado.nome}
              className="w-full h-full object-cover animate-fade-in"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          ) : (
            <span>{apenado.nome.charAt(0).toUpperCase()}</span>
          )}
        </div>
        
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-gray-900 dark:text-white truncate text-sm">{apenado.nome}</h3>
          <p className="text-xs text-gray-550 mt-1 truncate">
            {(apenado.unidade || apenado.custodiaReal) && `${apenado.unidade || apenado.custodiaReal} • `}
            {apenado.faccao || '—'}
          </p>

          <div className="mt-3 flex items-center justify-between gap-2 flex-wrap">
            <div className="flex flex-wrap gap-1">
              {apenado.facaoRealNome ? (
                <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold ${
                  isFaccaoConfirmada
                    ? 'bg-red-500 text-white animate-pulse shadow-sm shadow-red-500/20'
                    : 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300'
                }`}>
                  <Shield className="w-2.5 h-2.5" />
                  {apenado.facaoRealNome}
                </span>
              ) : temInteligencia && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-purple-50 text-purple-700 dark:bg-purple-950/20 dark:text-purple-400">
                  <div className="w-1.5 h-1.5 rounded-full bg-purple-500" />
                  Inteligência
                </span>
              )}
              {temVinculos && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-extrabold bg-indigo-600 text-white shadow-sm shadow-indigo-600/20 animate-pulse">
                  <Link2 className="w-2.5 h-2.5" />
                  COM VÍNCULO
                </span>
              )}
            </div>

            {temVinculos && onViewVinculos && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onViewVinculos(apenado.sipeId)
                }}
                className="px-2 py-0.5 rounded bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/30 dark:hover:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 text-[10px] font-bold border border-indigo-150 dark:border-indigo-900/40 flex items-center gap-1 transition-all"
                title="Ver vínculos deste apenado"
              >
                <Link2 className="w-2.5 h-2.5" />
                Ver Vínculos
              </button>
            )}
            {onViewMapa && podeMapa && (
              temMapaVinculo ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    onViewMapa(apenado)
                  }}
                  className="px-2 py-0.5 rounded bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold border border-emerald-500 shadow-sm shadow-emerald-600/25 flex items-center gap-1 transition-all"
                  title={apenado.mapaMunicipio ? `Mapeado em ${apenado.mapaMunicipio}` : 'Ver no mapa de facções'}
                >
                  <CheckCircle2 className="w-2.5 h-2.5" />
                  No Mapa
                </button>
              ) : (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    onViewMapa(apenado)
                  }}
                  className="px-2 py-0.5 rounded bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/30 dark:hover:bg-amber-900/40 text-amber-800 dark:text-amber-200 text-[10px] font-bold border-2 border-dashed border-amber-400 dark:border-amber-500 flex items-center gap-1 transition-all ring-2 ring-amber-400/30 hover:ring-amber-400/60"
                  title="Clique e selecione o município no mapa para vincular"
                >
                  <MapPinOff className="w-2.5 h-2.5" />
                  Vincular Mapa
                </button>
              )
            )}
          </div>
        </div>
      </div>
    </button>
  )
}

// ── Modal de Detalhes do Apenado em AIP ──────────────────────────────

export function AIApenadoModal({ apenado: initialApenado, layout, onClose, onUpdate, onDelete, userRole }: {
  apenado: AIPApenado
  layout?: any
  onClose: () => void
  onUpdate: (apenado: AIPApenado) => void
  onDelete?: (id: string) => Promise<void>
  userRole?: string
}) {
  const [apenadoState, setApenadoState] = useState(initialApenado)
  const apenado = apenadoState // Mantém compatibilidade com todos os usos de 'apenado.' no componente

  const [editing, setEditing] = useState(false)
  const [formData, setFormData] = useState(initialApenado)
  const canSeeCreator = userRole === 'SUPER_ADMIN' || userRole === 'ADMIN'
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [faccoes, setFaccoes] = useState<{ id: string; nome: string; cor: string }[]>([])
  const [sincronizando, setSincronizando] = useState(false)
  const { data: session } = useSession()
  const [showPrintConfig, setShowPrintConfig] = useState(false)
  const [gerandoDossie, setGerandoDossie] = useState(false)
  const [showDossierRequestModal, setShowDossierRequestModal] = useState(false)
  const [dossierJustification, setDossierJustification] = useState('')
  const [dossierRequestStatus, setDossierRequestStatus] = useState<'PENDING' | 'REJECTED' | 'NONE' | null>(null)
  const [dossierRequestReason, setDossierRequestReason] = useState<string | null>(null)
  const [checkingDossierPermission, setCheckingDossierPermission] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploadingPhoto(true)
    const toastId = toast.loading('Enviando nova foto...')
    try {
      const data = new FormData()
      data.append('foto', file)

      const res = await fetch(`/api/aip/apenados/${apenado.id}/foto`, {
        method: 'POST',
        body: data,
      })

      const result = await res.json()
      if (res.ok && result.success) {
        toast.success('Foto atualizada com sucesso!', { id: toastId })
        setApenadoState(result.apenado)
        setFormData(result.apenado)
        onUpdate(result.apenado)
      } else {
        toast.error(result.error || 'Erro ao enviar foto', { id: toastId })
      }
    } catch (err: any) {
      console.error('[AIP FOTO UPLOAD] Erro:', err)
      toast.error('Erro de rede ao enviar foto', { id: toastId })
    } finally {
      setUploadingPhoto(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handlePhotoDelete = async () => {
    if (!confirm('Deseja realmente remover a foto customizada? A foto original do SIPE voltará a ser exibida.')) return

    setUploadingPhoto(true)
    const toastId = toast.loading('Removendo foto customizada...')
    try {
      const res = await fetch(`/api/aip/apenados/${apenado.id}/foto`, {
        method: 'DELETE',
      })

      const result = await res.json()
      if (res.ok && result.success) {
        toast.success('Foto customizada removida!', { id: toastId })
        setApenadoState(result.apenado)
        setFormData(result.apenado)
        onUpdate(result.apenado)
      } else {
        toast.error(result.error || 'Erro ao remover foto', { id: toastId })
      }
    } catch (err: any) {
      console.error('[AIP FOTO DELETE] Erro:', err)
      toast.error('Erro de rede ao remover foto', { id: toastId })
    } finally {
      setUploadingPhoto(false)
    }
  }

  const handleGerarDossie = async () => {
    setCheckingDossierPermission(true)
    try {
      const res = await fetch(`/api/aip/dossier/check/${apenado.id}`)
      if (!res.ok) throw new Error('Falha ao verificar autorização')
      const data = await res.json()
      
      if (data.authorized) {
        setShowPrintConfig(true)
      } else {
        setDossierRequestStatus(data.status)
        if (data.request) {
          setDossierRequestReason(data.request.reason)
        }
        setShowDossierRequestModal(true)
      }
    } catch (err: any) {
      console.error(err)
      toast.error('Erro ao verificar autorização do dossiê.')
    } finally {
      setCheckingDossierPermission(false)
    }
  }

  const handleSendDossierRequest = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!dossierJustification.trim()) {
      toast.error('Informe a justificativa/motivo do acesso.')
      return
    }

    const toastId = toast.loading('Enviando solicitação de acesso...')
    try {
      const res = await fetch('/api/aip/dossier/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apenadoId: apenado.id,
          reason: dossierJustification,
        }),
      })

      if (!res.ok) {
        const errData = await res.json()
        throw new Error(errData.error || 'Erro na requisição')
      }

      toast.success('Solicitação de dossiê enviada para aprovação dos administradores!', { id: toastId })
      setDossierRequestStatus('PENDING')
      setDossierRequestReason(dossierJustification)
      setDossierJustification('')
    } catch (err: any) {
      console.error(err)
      toast.error(err.message || 'Erro ao enviar solicitação.', { id: toastId })
    }
  }

  useEffect(() => {
    setApenadoState(initialApenado)
    setFormData(initialApenado)
  }, [initialApenado])

  const handleSincronizarSipe = async () => {
    setSincronizando(true)
    const toastId = toast.loading(`Sincronizando dados de ${apenadoState.nome} com o SIPE...`)
    try {
      const res = await fetch(`/api/aip/apenados/${apenadoState.id}/sync`, {
        method: 'POST',
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Erro na requisição')
      }
      toast.success('Ficha do apenado em AIP atualizada com sucesso!', { id: toastId })
      if (data.apenado) {
        setApenadoState(data.apenado)
        setFormData(data.apenado)
        onUpdate(data.apenado)
      }
    } catch (err: any) {
      console.error(err)
      toast.error(err?.message || 'Falha ao sincronizar com o SIPE', { id: toastId })
    } finally {
      setSincronizando(false)
    }
  }

  // Carregar facções disponíveis quando entrar em modo de edição
  useEffect(() => {
    if (editing && faccoes.length === 0) {
      fetch('/api/aip/faccoes')
        .then((r) => r.json())
        .then((d) => setFaccoes(d.faccoes ?? []))
        .catch(() => {})
    }
  }, [editing]) // eslint-disable-line react-hooks/exhaustive-deps

  // Controle do Visualizador de Imagem (Zoom)
  const [zoomedPhotoUrl, setZoomedPhotoUrl] = useState<string | null>(null)
  const [zoomedPhotoTitle, setZoomedPhotoTitle] = useState<string>('')

  // Controle de Anexos
  const [anexos, setAnexos] = useState<AIPApenadoAnexo[]>([])
  const [uploadandoAnexo, setUploadandoAnexo] = useState(false)
  const [zoomedAnexoUrl, setZoomedAnexoUrl] = useState<string | null>(null)
  const [zoomedAnexoNome, setZoomedAnexoNome] = useState<string>('')

  // Estados para fluxo de comentários pré-upload
  const [anexoSelecionado, setAnexoSelecionado] = useState<File | null>(null)
  const [comentarioAnexo, setComentarioAnexo] = useState('')
  const [showModalComentario, setShowModalComentario] = useState(false)

  // Carregar anexos quando apenado é selecionado
  useEffect(() => {
    if (apenado?.id) {
      carregarAnexos(apenado.id)
    }
  }, [apenado?.id])

  const isPhotoStyleFull = layout?.photoStyle === 'full'
  const isFaccaoConfirmada = apenado.facaoRealNome && apenado.facaoNivel === 'confirmado'

  const activeSections = layout?.sections || [
    { id: 'dados_pessoais', title: 'Dados Pessoais (SIPE)', visible: true },
    { id: 'situacao_prisional', title: 'Situação Prisional (SIPE)', visible: true },
    { id: 'endereco_residencial', title: 'Endereço Residencial (SIPE)', visible: true },
    { id: 'advogados', title: 'Advogados (SIPE)', visible: true },
    { id: 'dados_inteligencia', title: 'Dados de Inteligência', visible: false },
    { id: 'visitantes', title: 'Visitantes Cadastrados', visible: true }
  ]

  // Funções de Gerenciamento de Anexos
  async function carregarAnexos(apenadoId: string) {
    try {
      const res = await fetch(`/api/aip/apenados/${apenadoId}/anexos`)
      const data = await res.json()
      setAnexos(data.anexos || [])
    } catch (e) {
      console.error('Erro ao carregar anexos:', e)
    }
  }

  function handleAnexoSelecionado(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setAnexoSelecionado(file)
    setComentarioAnexo('')
    setShowModalComentario(true)
    
    // Reseta o input para que o usuário possa selecionar o mesmo arquivo novamente
    e.target.value = ''
  }

  async function executarUploadAnexo() {
    if (!anexoSelecionado) return

    setShowModalComentario(false)
    setUploadandoAnexo(true)
    const toastId = toast.loading('Enviando anexo de inteligência...')
    try {
      const formData = new FormData()
      formData.append('file', anexoSelecionado)
      formData.append('tipoCompactacao', anexoSelecionado.type.startsWith('image/') ? 'imagem' : 'documento')
      if (comentarioAnexo.trim()) {
        formData.append('descricao', comentarioAnexo.trim())
      }

      console.log('📤 Iniciando upload:', {
        fileName: anexoSelecionado.name,
        size: anexoSelecionado.size,
        type: anexoSelecionado.type,
        apenadoId: apenado.id,
        descricao: comentarioAnexo,
        endpoint: `/api/aip/apenados/${apenado.id}/anexos`,
      })

      const res = await fetch(`/api/aip/apenados/${apenado.id}/anexos`, {
        method: 'POST',
        body: formData,
      })

      console.log('📥 Resposta do servidor:', {
        status: res.status,
        statusText: res.statusText,
      })

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}))
        console.error('❌ Erro na resposta:', errorData)
        throw new Error(errorData.error || `Erro HTTP ${res.status}: ${res.statusText}`)
      }

      const data = await res.json()
      console.log('✅ Arquivo enviado:', data)
      setAnexos([data.anexo, ...anexos])
      toast.success('Arquivo enviado com sucesso', { id: toastId })
    } catch (err: any) {
      console.error('💥 Erro ao fazer upload:', err)
      toast.error(`Erro ao enviar arquivo: ${err?.message || 'desconhecido'}`, { id: toastId })
    } finally {
      setUploadandoAnexo(false)
      setAnexoSelecionado(null)
      setComentarioAnexo('')
    }
  }

  async function handleDeleteAnexo(anexoId: string, apenadoId: string) {
    if (!confirm('Remover anexo?')) return
    try {
      const res = await fetch(`/api/aip/apenados/${apenadoId}/anexos/${anexoId}`, {
        method: 'DELETE',
      })
      if (!res.ok) throw new Error()
      setAnexos(anexos.filter(a => a.id !== anexoId))
      toast.success('Anexo removido')
    } catch {
      toast.error('Erro ao remover anexo')
    }
  }

  // Helper para determinar tipo de arquivo e se suporta visualização
  function getFileTypeInfo(tipoMime: string, nome: string) {
    const isImage = tipoMime.startsWith('image/')
    const isPdf = tipoMime === 'application/pdf'
    let icon = '📄'
    if (isImage) icon = '🖼️'
    if (isPdf) icon = '📑'
    return { isImage, isPdf, icon }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await fetch(`/api/aip/apenados/${apenado.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          facaoRealNome: formData.facaoRealNome,
          facaoNivel: formData.facaoNivel,
          notasInteligencia: formData.notasInteligencia,
          observacoes: formData.observacoes,
          facaoRelevancia: formData.facaoRelevancia,
          vulgo: formData.vulgo,
          custodiaReal: formData.custodiaReal,
          atualizadoPor: 'current-user' // TODO: integrar com auth real
        })
      })

      if (res.ok) {
        const { apenado: updated } = await res.json()
        setFormData(updated)
        onUpdate(updated)
        setEditing(false)
        toast.success('Inteligência atualizada com sucesso')
      } else {
        toast.error('Erro ao atualizar')
      }
    } catch (error) {
      console.error('Erro ao salvar:', error)
      toast.error('Erro ao salvar alterações')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    setDeleting(true)
    try {
      console.log(`[AIPanel] Iniciando deleção de: ${apenado.id}`)

      const url = `/api/aip/apenados/${apenado.id}?confirm=true`
      console.log(`[AIPanel] URL: ${url}`)

      const res = await fetch(url, {
        method: 'DELETE'
      })

      console.log(`[AIPanel] Status da resposta: ${res.status}`)

      const data = await res.json()
      console.log(`[AIPanel] Dados da resposta:`, data)

      if (res.ok) {
        console.log(`[AIPanel] Deleção bem-sucedida`)
        toast.success('Apenado deletado com sucesso')
        if (onDelete) {
          await onDelete(apenado.id)
        }
        onClose()
      } else {
        console.error(`[AIPanel] Erro na deleção: ${data.message}`)
        toast.error(data.message || 'Erro ao deletar')
      }
    } catch (error) {
      console.error('[AIPanel] Erro ao deletar:', error)
      toast.error('Erro ao deletar apenado')
    } finally {
      setDeleting(false)
      setShowDeleteConfirm(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-900 rounded-t-2xl md:rounded-2xl shadow-2xl w-full md:max-w-2xl h-[92vh] md:h-auto md:max-h-[85vh] flex flex-col transition-all duration-300"
        onClick={e => e.stopPropagation()}
      >
        {/* Drag handle visual para mobile */}
        <div className="w-12 h-1.5 bg-gray-300 dark:bg-gray-600 rounded-full mx-auto my-3 md:hidden shrink-0" />
        {/* Header */}
        <div className="p-6 border-b border-gray-200 dark:border-gray-700 shrink-0">
          <div className="flex items-start justify-between gap-4">
            <div className="flex gap-4 items-center flex-1 min-w-0">
              {/* Foto grande/avatar condicional baseada no layout */}
              {!isPhotoStyleFull && (
                <div className="relative group">
                  <div
                    onClick={() => {
                      if (editing) {
                        fileInputRef.current?.click()
                      } else if (apenado.photoPath || apenado.customPhotoPath) {
                        setZoomedPhotoUrl(`/api/aip/apenados/${apenado.id}/foto`);
                        setZoomedPhotoTitle(apenado.nome);
                      }
                    }}
                    className={`w-24 h-24 rounded-2xl overflow-hidden flex-shrink-0 bg-gradient-to-br from-purple-400 to-purple-600 shadow-md flex items-center justify-center text-white font-bold text-3xl select-none relative ${
                      editing 
                        ? 'cursor-pointer hover:brightness-90 active:scale-95 transition-all' 
                        : (apenado.photoPath || apenado.customPhotoPath)
                          ? 'cursor-zoom-in hover:opacity-90 active:scale-95 transition-all'
                          : ''
                    }`}
                  >
                    {(apenado.photoPath || apenado.customPhotoPath) ? (
                      <img
                        src={`/api/aip/apenados/${apenado.id}/foto`}
                        alt={apenado.nome}
                        className="w-full h-full object-cover animate-fade-in"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                      />
                    ) : (
                      <span>{apenado.nome.charAt(0).toUpperCase()}</span>
                    )}

                    {editing && (
                      <div className="absolute inset-0 bg-black/40 flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity">
                        <Image className="w-6 h-6 animate-pulse" />
                      </div>
                    )}
                  </div>

                  {editing && apenado.customPhotoPath && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handlePhotoDelete();
                      }}
                      className="absolute -top-1.5 -right-1.5 bg-red-500 hover:bg-red-650 text-white rounded-full p-1 shadow-md hover:scale-105 transition-all z-20"
                      title="Remover foto customizada"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}

                  {uploadingPhoto && (
                    <div className="absolute inset-0 bg-black/55 flex items-center justify-center text-white rounded-2xl z-10 animate-fade-in">
                      <Loader2 className="w-5 h-5 animate-spin" />
                    </div>
                  )}

                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handlePhotoUpload}
                    accept="image/*"
                    className="hidden"
                  />
                </div>
              )}

              <div className="min-w-0 flex-1">
                <h2 className="text-lg font-bold text-gray-900 dark:text-white leading-tight truncate">{apenado.nome}</h2>
                {apenado.nomeOutro && <p className="text-sm text-gray-500 mt-1 truncate">Também: {apenado.nomeOutro}</p>}
                <p className="text-xs text-gray-500 mt-1">SIPE ID: {apenado.sipeId}</p>
                
                {/* Badge de Facção Real em Destaque */}
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {apenado.facaoRealNome ? (
                    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold shadow-sm ${
                      isFaccaoConfirmada
                        ? 'bg-red-500 text-white animate-pulse shadow-sm shadow-red-500/20'
                        : 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300'
                    }`}>
                      <Shield className="w-3.5 h-3.5" />
                      {apenado.facaoRealNome} {isFaccaoConfirmada ? '(Confirmada pela Agência)' : '(Suspeita)'}
                    </span>
                  ) : apenado.faccao ? (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300">
                      Facção SIPE: {apenado.faccao}
                    </span>
                  ) : null}
                </div>
              </div>
            </div>
            
            <div className="flex items-center gap-2 shrink-0">
              {!editing ? (
                <>
                  <button
                    onClick={handleGerarDossie}
                    disabled={gerandoDossie || checkingDossierPermission}
                    className="p-2 hover:bg-purple-50 dark:hover:bg-purple-900/30 rounded-lg text-purple-600 dark:text-purple-400 disabled:opacity-50"
                    title="Gerar Dossiê (Ficha de Qualificação)"
                  >
                    {gerandoDossie || checkingDossierPermission ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
                  </button>
                  <button
                    onClick={handleSincronizarSipe}
                    disabled={sincronizando}
                    className="p-2 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg text-blue-600 dark:text-blue-400 disabled:opacity-50"
                    title="Atualizar SIPE"
                  >
                    {sincronizando ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                  </button>
                  <button
                    onClick={() => setEditing(true)}
                    className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg text-gray-600 dark:text-gray-400"
                    title="Editar dados de inteligência"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setShowDeleteConfirm(true)}
                    className="p-2 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg text-red-600 dark:text-red-400"
                    title="Deletar apenado"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </>
              ) : null}
              <button 
                onClick={onClose} 
                className="p-2 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-xl transition-colors text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300"
                title="Fechar"
              >
                ✕
              </button>
            </div>
          </div>
        </div>

        {/* Conteúdo */}
        <div className="flex-1 overflow-y-auto">
          {/* Foto grande em tamanho real (se habilitado no layout) */}
          {isPhotoStyleFull && (
            <div className="p-5 flex justify-center bg-gray-50/50 dark:bg-gray-950/20 border-b border-gray-100 dark:border-gray-800">
              <div className="relative group">
                <div 
                  onClick={() => {
                    if (editing) {
                      fileInputRef.current?.click()
                    } else if (apenado.photoPath || apenado.customPhotoPath) {
                      setZoomedPhotoUrl(`/api/aip/apenados/${apenado.id}/foto`);
                      setZoomedPhotoTitle(apenado.nome);
                    }
                  }}
                  className={`relative max-w-full rounded-2xl overflow-hidden bg-gray-100 dark:bg-gray-850 border border-gray-200 dark:border-gray-800 shadow-md ${
                    editing 
                      ? 'cursor-pointer hover:brightness-95 transition-all' 
                      : (apenado.photoPath || apenado.customPhotoPath)
                        ? 'cursor-zoom-in hover:opacity-95 transition-opacity'
                        : ''
                  }`}
                >
                  {(apenado.photoPath || apenado.customPhotoPath) ? (
                    <img
                      src={`/api/aip/apenados/${apenado.id}/foto`}
                      alt={apenado.nome}
                      className="max-h-[320px] w-auto object-contain animate-fade-in"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  ) : (
                    <div className="w-40 h-40 flex items-center justify-center text-gray-400 text-5xl font-bold select-none">
                      {apenado.nome.charAt(0).toUpperCase()}
                    </div>
                  )}

                  {editing && (
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity">
                      <Image className="w-8 h-8 animate-pulse" />
                    </div>
                  )}
                </div>

                {editing && apenado.customPhotoPath && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handlePhotoDelete();
                    }}
                    className="absolute -top-1.5 -right-1.5 bg-red-500 hover:bg-red-650 text-white rounded-full p-1.5 shadow-md hover:scale-105 transition-all z-20"
                    title="Remover foto customizada"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}

                {uploadingPhoto && (
                  <div className="absolute inset-0 bg-black/55 flex items-center justify-center text-white rounded-2xl z-10 animate-fade-in">
                    <Loader2 className="w-8 h-8 animate-spin" />
                  </div>
                )}

                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handlePhotoUpload}
                  accept="image/*"
                  className="hidden"
                />
              </div>
            </div>
          )}

          {/* Renderização Dinâmica de Seções na Ordem do Layout */}
          {activeSections.map((section: any) => {
            if (!section.visible) return null

            switch (section.id) {
              case 'dados_pessoais':
                return (
                  <div key={section.id} className="p-5 border-b border-gray-100 dark:border-gray-800">
                    <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                      <User className="w-4 h-4 text-blue-500" />
                      {section.title || 'Dados Pessoais (SIPE)'}
                    </h3>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      {[
                        ['SIPE ID', `#${apenado.sipeId}`],
                        ['CPF', apenado.cpf],
                        ['RG', apenado.rg],
                        ['Data Nasc.', apenado.dataNascimento],
                        ['Sexo', apenado.sexo],
                        ['Etnia', apenado.etnia],
                        ['Naturalidade', apenado.naturalidade],
                        ['Tipo Sanguíneo', apenado.tipoSanguineo],
                        ['Estado Civil', apenado.estadoCivil],
                        ['Telefone', apenado.telefone],
                        ['Nome da Mãe', apenado.nomeMae],
                        ['Nome do Pai', apenado.nomePai],
                        ['Nome do Cônjuge', apenado.nomeConjuge],
                        ['Filhos', apenado.qtdFilhos != null ? `${apenado.qtdFilhos}` : null],
                      ].map(([label, value]) => value ? (
                        <div key={String(label)}>
                          <p className="text-xs text-gray-500 mb-0.5">{label}</p>
                          <p className="text-gray-900 dark:text-white font-medium">{value}</p>
                        </div>
                      ) : null)}
                    </div>
                  </div>
                )

              case 'situacao_prisional':
                return (
                  <div key={section.id} className="p-5 border-b border-gray-100 dark:border-gray-800">
                    <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                      <Shield className="w-4 h-4 text-blue-500" />
                      {section.title || 'Situação Prisional (SIPE)'}
                    </h3>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      {[
                        ['Unidade', apenado.unidade || apenado.custodiaReal, apenado.unidade ? listaEnderecosHrefFromUnidadeAip(apenado.unidade) : undefined],
                        ['Cela', apenado.cela],
                        ['Regime', apenado.regime],
                        ['Situação', apenado.situacao],
                        ['Entrada', apenado.dataEntrada],
                        ['Pena', apenado.tempoPena],
                        ['Monitorado', apenado.monitorado === true ? 'Sim' : apenado.monitorado === false ? 'Não' : null],
                        ['RJI', apenado.rji],
                        ['Preso Oriundo', apenado.presoOriundo],
                        ['Intramuro', apenado.intramuro === true ? 'Sim' : apenado.intramuro === false ? 'Não' : null],
                      ].map(([label, value, href]) => value != null ? (
                        <div key={String(label)}>
                          <p className="text-xs text-gray-500 mb-0.5">{label}</p>
                          {href ? (
                            <Link href={href} className="text-blue-600 dark:text-blue-400 font-medium hover:underline">
                              {value}
                            </Link>
                          ) : (
                            <p className="text-gray-900 dark:text-white font-medium">{value}</p>
                          )}
                        </div>
                      ) : null)}
                    </div>
                  </div>
                )

              case 'endereco_residencial':
                if (!(apenado.logradouro || apenado.cidade || apenado.cep)) return null
                return (
                  <div key={section.id} className="p-5 border-b border-gray-100 dark:border-gray-800">
                    <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-blue-500" />
                      {section.title || 'Endereço Residencial (SIPE)'}
                    </h3>
                    <div className="bg-gray-50 dark:bg-gray-800/40 rounded-xl p-4 text-sm space-y-1 border border-gray-100 dark:border-gray-700/50">
                      {apenado.logradouro && (
                        <p className="text-gray-900 dark:text-white">
                          <span className="font-semibold text-gray-500">Logradouro:</span> {apenado.logradouro}
                          {apenado.numero && `, Nº ${apenado.numero}`}
                          {apenado.complemento && ` (${apenado.complemento})`}
                        </p>
                      )}
                      {apenado.bairro && (
                        <p className="text-gray-900 dark:text-white">
                          <span className="font-semibold text-gray-500">Bairro:</span> {apenado.bairro}
                        </p>
                      )}
                      {(apenado.cidade || apenado.uf) && (
                        <p className="text-gray-900 dark:text-white">
                          <span className="font-semibold text-gray-500">Cidade/UF:</span> {apenado.cidade || ''}{apenado.uf ? `/${apenado.uf}` : ''}
                        </p>
                      )}
                      {apenado.cep && (
                        <p className="text-gray-900 dark:text-white">
                          <span className="font-semibold text-gray-500">CEP:</span> {apenado.cep}
                        </p>
                      )}
                    </div>
                  </div>
                )

              case 'advogados':
                if (!(apenado.sipeApenado?.vinculosAdvogado && apenado.sipeApenado.vinculosAdvogado.length > 0)) return null
                return (
                  <div key={section.id} className="p-5 border-b border-gray-100 dark:border-gray-800">
                    <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                      <Briefcase className="w-4 h-4 text-blue-500" />
                      {section.title || 'Advogados (SIPE)'}
                    </h3>
                    <div className="space-y-2">
                      {apenado.sipeApenado.vinculosAdvogado.map(v => (
                        <div key={v.advogado.id} className="flex items-center justify-between bg-gray-50 dark:bg-gray-800/40 rounded-xl p-3 text-sm border border-gray-100 dark:border-gray-700/50">
                          <span className="font-medium text-gray-900 dark:text-white">{v.advogado.nome}</span>
                          {v.advogado.oab && <span className="text-xs text-gray-500">OAB {v.advogado.oab}</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                )

              case 'dados_inteligencia':
                return (
                  <div key={section.id} className="p-5">
                    <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4 flex items-center gap-2">
                      <Brain className="w-4 h-4 text-purple-500" />
                      {section.title || 'Dados de Inteligência'}
                    </h3>
                    <div className="space-y-4">
                      {/* Grid de Informações Estruturadas */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Facção Real */}
                        <div>
                          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Facção Real (Verificada)
                          </label>
                          {editing ? (
                            <select
                              value={formData.facaoRealNome || ''}
                              onChange={e => setFormData({ ...formData, facaoRealNome: e.target.value })}
                              className="w-full px-3 py-2 text-sm bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500"
                            >
                              <option value="">Selecionar facção...</option>
                              {faccoes.map((f) => (
                                <option key={f.id} value={f.nome}>{f.nome}</option>
                              ))}
                            </select>
                          ) : (
                            <p className="text-sm text-gray-900 dark:text-white font-medium">{formData.facaoRealNome || '(não informado)'}</p>
                          )}
                        </div>

                        {/* Nível de Confiança */}
                        <div>
                          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Nível de Confiança
                          </label>
                          {editing ? (
                            <select
                              value={formData.facaoNivel || ''}
                              onChange={e => setFormData({ ...formData, facaoNivel: e.target.value })}
                              className="w-full px-3 py-2 text-sm bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500"
                            >
                              <option value="">Selecionar...</option>
                              <option value="confirmado">Confirmado</option>
                              <option value="provavel">Provável</option>
                              <option value="suspeita">Suspeita</option>
                              <option value="improvavel">Improvável</option>
                              <option value="negado">Negado</option>
                            </select>
                          ) : (
                            <p className="text-sm text-gray-900 dark:text-white font-medium">{formData.facaoNivel || '(não informado)'}</p>
                          )}
                        </div>

                        {/* Vulgo / Apelido */}
                        <div>
                          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Vulgo / Apelido
                          </label>
                          {editing ? (
                            <input
                              type="text"
                              value={formData.vulgo || ''}
                              onChange={e => setFormData({ ...formData, vulgo: e.target.value })}
                              placeholder="Ex: Baixinho, Gordinho, etc."
                              className="w-full px-3 py-2 text-sm bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500"
                            />
                          ) : (
                            <p className="text-sm text-gray-900 dark:text-white font-medium">{formData.vulgo || '(não informado)'}</p>
                          )}
                        </div>

                        {/* Relevância na Facção */}
                        <div>
                          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Relevância na Facção
                          </label>
                          {editing ? (
                            <select
                              value={formData.facaoRelevancia || ''}
                              onChange={e => setFormData({ ...formData, facaoRelevancia: e.target.value })}
                              className="w-full px-3 py-2 text-sm bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500"
                            >
                              <option value="">Selecionar...</option>
                              <option value="Membro">Membro</option>
                              <option value="Membro de Relevância">Membro de Relevância</option>
                              <option value="Liderança">Liderança</option>
                              <option value="Já exerceu Liderança">Já exerceu Liderança</option>
                            </select>
                          ) : (
                            <p className="text-sm text-gray-900 dark:text-white font-medium">{formData.facaoRelevancia || '(não informado)'}</p>
                          )}
                        </div>

                        {/* Local de Custódia Real */}
                        <div className="md:col-span-2">
                          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Local de Custódia Real (Fora de RO)
                          </label>
                          {editing ? (
                            <input
                              type="text"
                              value={formData.custodiaReal || ''}
                              onChange={e => setFormData({ ...formData, custodiaReal: e.target.value })}
                              placeholder="Ex: Presídio Federal de Catanduvas, Penitenciária de SP, etc."
                              className="w-full px-3 py-2 text-sm bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500"
                            />
                          ) : (
                            <p className="text-sm text-gray-900 dark:text-white font-medium">{formData.custodiaReal || '(não informado)'}</p>
                          )}
                        </div>
                      </div>

                      {/* Notas de Inteligência */}
                      <div>
                        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Notas de Inteligência
                        </label>
                        {editing ? (
                          <textarea
                            value={formData.notasInteligencia || ''}
                            onChange={e => setFormData({ ...formData, notasInteligencia: e.target.value })}
                            placeholder="Documentar observações, análises, vinculações..."
                            rows={4}
                            className="w-full px-3 py-2 text-sm bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500"
                          />
                        ) : (
                          <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                            {formData.notasInteligencia || '(nenhuma nota)'}
                          </p>
                        )}
                      </div>

                      {/* Observações */}
                      <div>
                        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Observações Adicionais
                        </label>
                        {editing ? (
                          <textarea
                            value={formData.observacoes || ''}
                            onChange={e => setFormData({ ...formData, observacoes: e.target.value })}
                            placeholder="Informações complementares..."
                            rows={3}
                            className="w-full px-3 py-2 text-sm bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500"
                          />
                        ) : (
                          <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                            {formData.observacoes || '(nenhuma observação)'}
                          </p>
                        )}
                      </div>

                      {/* Metadados do Registro (Criador / Última Atualização) - Visível apenas para SUPER_ADMIN e ADMIN */}
                      {canSeeCreator && (
                        <div className="bg-purple-50/20 dark:bg-purple-950/10 rounded-xl p-3 border border-purple-100/40 dark:border-purple-900/30 text-xs text-gray-500 space-y-1.5 mt-2 shrink-0">
                          <div className="flex flex-wrap items-center gap-x-2">
                            <span className="font-bold text-purple-700 dark:text-purple-400">Adicionado por:</span>
                            <span className="text-gray-900 dark:text-white font-medium">
                              {apenado.cadastradoPorNome || apenado.cadastradoPor || 'Sistema/Desconhecido'}
                            </span>
                            {apenado.cadastradoEm && (
                              <span className="text-[10px] text-gray-450 dark:text-gray-550">
                                em {new Date(apenado.cadastradoEm).toLocaleString('pt-BR')}
                              </span>
                            )}
                          </div>
                          {apenado.atualizadoPorNome && (
                            <div className="flex flex-wrap items-center gap-x-2 border-t border-purple-150/20 dark:border-purple-900/10 pt-1.5 mt-1.5">
                              <span className="font-bold text-purple-700 dark:text-purple-400">Última atualização por:</span>
                              <span className="text-gray-900 dark:text-white font-medium">{apenado.atualizadoPorNome}</span>
                              {apenado.atualizadoEm && (
                                <span className="text-[10px] text-gray-450 dark:text-gray-550">
                                  em {new Date(apenado.atualizadoEm).toLocaleString('pt-BR')}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Anexos - Dados de Inteligência */}
                      <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
                        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                          <Paperclip className="w-4 h-4" /> Anexos - Dados de Inteligência
                        </h3>

                        {/* Input de upload */}
                        {editing && (
                          <div className="mb-4">
                            <label className="flex items-center justify-center gap-2 p-4 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg cursor-pointer hover:border-purple-400 dark:hover:border-purple-500 transition-colors">
                              <Paperclip className="w-4 h-4 text-gray-400" />
                              <span className="text-sm text-gray-600 dark:text-gray-400">Clique para anexar arquivo ou imagem</span>
                              <input
                                type="file"
                                onChange={handleAnexoSelecionado}
                                disabled={uploadandoAnexo}
                                className="hidden"
                              />
                            </label>
                            {uploadandoAnexo && <p className="text-xs text-gray-500 mt-2">Enviando...</p>}
                          </div>
                        )}

                        {/* Lista de anexos */}
                        {anexos.length > 0 ? (
                          <div className="space-y-2">
                            {anexos.map(anexo => {
                              const { isImage, isPdf, icon } = getFileTypeInfo(anexo.tipoMime, anexo.nomeOriginal)
                              return (
                                <div key={anexo.id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700">
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-1">
                                      <span className="text-lg flex-shrink-0">{icon}</span>
                                      <p className="text-xs font-medium truncate text-gray-900 dark:text-white">{anexo.nomeOriginal}</p>
                                    </div>
                                    <p className="text-xs text-gray-500 dark:text-gray-400 ml-6">
                                      {(anexo.tamanhoS3 / 1024).toFixed(0)}KB • {new Date(anexo.dataUpload).toLocaleDateString('pt-BR')} por {anexo.usuarioUpload?.name || 'desconhecido'}
                                    </p>
                                    {anexo.descricao && (
                                      <p className="text-xs text-gray-600 dark:text-gray-400 ml-6 mt-1 italic">{anexo.descricao}</p>
                                    )}
                                  </div>
                                  <div className="flex gap-2 ml-2 flex-shrink-0">
                                    {isImage && (
                                      <button
                                        onClick={() => {
                                          setZoomedAnexoUrl(`/api/aip/apenados/${apenado.id}/anexos/${anexo.id}`)
                                          setZoomedAnexoNome(anexo.nomeOriginal)
                                        }}
                                        className="p-1.5 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded transition-colors"
                                        title="Visualizar"
                                      >
                                        <Eye className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                                      </button>
                                    )}
                                    {isPdf && (
                                      <a
                                        href={`/api/aip/apenados/${apenado.id}/anexos/${anexo.id}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="p-1.5 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded transition-colors"
                                        title="Abrir PDF"
                                      >
                                        <Eye className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                                      </a>
                                    )}
                                    <a
                                      href={`/api/aip/apenados/${apenado.id}/anexos/${anexo.id}?download=true`}
                                      className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
                                      title="Download"
                                    >
                                      <Download className="w-4 h-4 text-gray-600 dark:text-gray-300" />
                                    </a>
                                    {editing && (
                                      <button
                                        onClick={() => handleDeleteAnexo(anexo.id, apenado.id)}
                                        className="p-1.5 hover:bg-red-100 dark:hover:bg-red-900/30 rounded transition-colors"
                                        title="Remover"
                                      >
                                        <Trash2 className="w-4 h-4 text-red-500" />
                                      </button>
                                    )}
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        ) : (
                          <p className="text-xs text-gray-500 dark:text-gray-400">(nenhum anexo)</p>
                        )}
                      </div>
                    </div>
                  </div>
                )

              case 'visitantes':
                if (!(apenado.fotoVisitantes && apenado.fotoVisitantes.length > 0)) return null
                return (
                  <div key={section.id} className="p-5 border-t border-gray-100 dark:border-gray-800">
                    <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4 flex items-center gap-2">
                      <Users className="w-4 h-4 text-purple-500" />
                      {section.title || 'Visitantes Cadastrados'}
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {apenado.fotoVisitantes.map(v => (
                        <div key={v.id} className="flex items-center gap-3 bg-gray-50 dark:bg-gray-800/40 rounded-xl p-3 text-sm relative border border-gray-100 dark:border-gray-700/50">
                          {/* Badge de Ativo/Inativo */}
                          <span className={`absolute top-2 right-2 px-1.5 py-0.5 text-[9px] font-bold rounded-md ${
                            v.ativoVisitante 
                              ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300' 
                              : 'bg-gray-200 dark:bg-gray-700 text-gray-500'
                          }`}>
                            {v.ativoVisitante ? 'Ativo' : 'Inativo'}
                          </span>
                          
                          {/* Foto do Visitante com zoom */}
                          <div
                            onClick={() => {
                              if (v.photoPath && v.visitanteId) {
                                setZoomedPhotoUrl(`/api/sipe/visitantes/${v.visitanteId}/foto`);
                                setZoomedPhotoTitle(v.nomeVisitante || 'Visitante');
                              }
                            }}
                            className={`${
                               isPhotoStyleFull 
                                 ? 'w-24 h-32 rounded-xl' 
                                 : 'w-10 h-10 rounded-lg'
                             } overflow-hidden flex-shrink-0 bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-gray-400 select-none transition-all ${
                               v.photoPath && v.visitanteId ? 'cursor-zoom-in hover:opacity-90 active:scale-95' : ''
                             }`}
                          >
                            {v.photoPath && v.visitanteId ? (
                              <img
                                src={`/api/sipe/visitantes/${v.visitanteId}/foto`}
                                alt={v.nomeVisitante || 'Visitante'}
                                className={`w-full h-full ${
                                   isPhotoStyleFull ? 'object-contain' : 'object-cover'
                                 }`}
                                onError={(e) => {
                                  (e.target as HTMLImageElement).style.display = 'none';
                                }}
                              />
                            ) : (
                              <User className={isPhotoStyleFull ? 'w-12 h-12' : 'w-5 h-5'} />
                            )}
                          </div>
                          
                          {/* Informações do Visitante */}
                          <div className="min-w-0 flex-1 pr-12">
                            <p className="font-semibold text-gray-900 dark:text-white truncate">
                              {v.nomeVisitante || '—'}
                            </p>
                            <p className="text-xs text-gray-500 mt-0.5 truncate">
                              {v.parentescoVisitante && <span className="font-medium text-purple-600 dark:text-purple-400">{v.parentescoVisitante}</span>}
                              {v.parentescoVisitante && v.cpfVisitante && <span> · </span>}
                              {v.cpfVisitante && <span>CPF: {v.cpfVisitante}</span>}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )

              default:
                return null
            }
          })}
        </div>

        {/* Confirmação de Deleção */}
        {showDeleteConfirm && (
          <div className="fixed inset-0 z-[51] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setShowDeleteConfirm(false)}>
            <div
              className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-sm p-6"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-lg bg-red-100 dark:bg-red-900/30 flex items-center justify-center shrink-0">
                  <Trash2 className="w-5 h-5 text-red-600 dark:text-red-400" />
                </div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">Deletar Apenado?</h3>
              </div>

              <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
                Você tem certeza que deseja deletar <strong>{apenado.nome}</strong> do AIP? Esta ação não pode ser desfeita.
              </p>

              <div className="flex items-center gap-3">
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="flex-1 px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  Deletar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal de Comentário do Anexo */}
        {showModalComentario && anexoSelecionado && (
          <div className="fixed inset-0 z-[51] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => { setShowModalComentario(false); setAnexoSelecionado(null); }}>
            <div
              className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md p-6 border border-gray-200 dark:border-gray-800"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center shrink-0">
                  <Paperclip className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white">Comentário do Anexo</h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Adicione uma descrição sobre o arquivo anexado</p>
                </div>
              </div>

              {/* Informações do Arquivo */}
              <div className="mb-4 p-3 bg-gray-50 dark:bg-gray-800/40 rounded-xl border border-gray-100 dark:border-gray-700/50 flex flex-col gap-1 text-xs">
                <span className="font-semibold text-gray-700 dark:text-gray-300 truncate">{anexoSelecionado.name}</span>
                <span className="text-gray-500">Tamanho: {(anexoSelecionado.size / 1024).toFixed(0)} KB</span>
              </div>

              {/* Campo do Comentário */}
              <div className="mb-6">
                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5">
                  Comentário / Descrição
                </label>
                <textarea
                  value={comentarioAnexo}
                  onChange={e => setComentarioAnexo(e.target.value)}
                  placeholder="Escreva um comentário explicativo sobre o arquivo..."
                  rows={3}
                  className="w-full text-sm p-3 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 placeholder-gray-400 dark:placeholder-gray-500 text-gray-900 dark:text-white resize-none"
                />
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => { setShowModalComentario(false); setAnexoSelecionado(null); }}
                  className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={executarUploadAnexo}
                  className="flex-1 px-4 py-2 text-sm font-medium text-white bg-purple-600 rounded-lg hover:bg-purple-700 flex items-center justify-center gap-2 shadow-md shadow-purple-600/10"
                >
                  Confirmar e Enviar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        {editing && (
          <div className="flex items-center gap-3 p-5 border-t border-gray-200 dark:border-gray-700 shrink-0">
            <button
              onClick={() => {
                setFormData(apenado)
                setEditing(false)
              }}
              className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700"
            >
              Cancelar
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 px-4 py-2 text-sm font-medium text-white bg-purple-600 rounded-lg hover:bg-purple-700 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Salvar
            </button>
          </div>
        )}
      </div>

      {/* Lightbox para zoom da imagem */}
      {zoomedPhotoUrl && (
        <div
          className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black/90 backdrop-blur-md cursor-zoom-out p-4"
          onClick={(e) => {
            e.stopPropagation()
            setZoomedPhotoUrl(null)
          }}
        >
          <div className="relative max-w-3xl max-h-[90vh] flex flex-col items-center gap-4 animate-in fade-in zoom-in-95 duration-200">
            <img
              src={zoomedPhotoUrl}
              alt={zoomedPhotoTitle || apenado.nome}
              className="max-w-full max-h-[80vh] object-contain rounded-xl shadow-2xl border border-gray-800 animate-in fade-in zoom-in-95 duration-200"
            />
            <div className="bg-black/60 text-white px-4 py-2 rounded-full text-sm font-semibold backdrop-blur-sm">
              {zoomedPhotoTitle || apenado.nome}
            </div>
            <button
              className="absolute top-4 right-4 bg-red-600 hover:bg-red-700 text-white p-2 rounded-full transition-colors backdrop-blur-sm text-lg"
              onClick={(e) => {
                e.stopPropagation()
                setZoomedPhotoUrl(null)
              }}
              title="Fechar"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Modal de Visualização de Anexos */}
      {zoomedAnexoUrl && (
        <div
          className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black/90 backdrop-blur-md cursor-zoom-out p-4"
          onClick={(e) => {
            e.stopPropagation()
            setZoomedAnexoUrl(null)
          }}
        >
          <div className="relative max-w-3xl max-h-[90vh] flex flex-col items-center gap-4 animate-in fade-in zoom-in-95 duration-200">
            <img
              src={zoomedAnexoUrl}
              alt={zoomedAnexoNome}
              className="max-w-full max-h-[80vh] object-contain rounded-xl shadow-2xl border border-gray-800 animate-in fade-in zoom-in-95 duration-200"
            />
            <div className="bg-black/60 text-white px-4 py-2 rounded-full text-sm font-semibold backdrop-blur-sm max-w-xl text-center">
              {zoomedAnexoNome}
            </div>
            <button
              className="absolute top-4 right-4 bg-red-600 hover:bg-red-700 text-white p-2 rounded-full transition-colors backdrop-blur-sm text-lg"
              onClick={(e) => {
                e.stopPropagation()
                setZoomedAnexoUrl(null)
              }}
              title="Fechar"
            >
              ✕
            </button>
          </div>
        </div>
      )}
      {showPrintConfig && (
        <AIFichaLayoutModal
          layout={layout}
          submitLabel="Gerar Relatório"
          onClose={() => setShowPrintConfig(false)}
          onSave={async (tempLayout) => {
            setShowPrintConfig(false)
            setGerandoDossie(true)
            const toastId = toast.loading('Gerando Ficha de Qualificação (Dossiê)...')
            try {
              const printLayout = {
                ...tempLayout,
                watermark: layout?.watermark
              }
              await printAIPDossier(apenado, session?.user?.email || session?.user?.name, userRole, printLayout)
              
              // Gravar log de auditoria do download
              await fetch('/api/aip/dossier/log', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ apenadoId: apenado.id })
              })

              toast.success('Dossiê enviado para impressão com sucesso!', { id: toastId })
            } catch (err: any) {
              console.error(err)
              toast.error('Erro ao gerar dossiê de qualificação.', { id: toastId })
            } finally {
              setGerandoDossie(false)
            }
          }}
        />
      )}

      {showDossierRequestModal && (
        <div 
          className="fixed inset-0 z-[60] flex items-center justify-center p-4"
          onClick={(e) => e.stopPropagation()}
        >
          <div
            onClick={() => setShowDossierRequestModal(false)}
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
          />
          <div className="bg-white dark:bg-gray-900 rounded-3xl w-full max-w-md shadow-2xl relative z-10 p-6 space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-base font-bold text-title flex items-center gap-2">
                🔒 Controle de Acesso ao Dossiê
              </h3>
              <button
                onClick={() => setShowDossierRequestModal(false)}
                className="text-subtle hover:text-body transition-colors font-bold text-sm"
              >
                ✕
              </button>
            </div>

            {dossierRequestStatus === 'PENDING' ? (
              <div className="space-y-4">
                <div className="p-4 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/30 rounded-2xl flex gap-3">
                  <div className="text-amber-500 font-bold">⚠️</div>
                  <div className="space-y-1">
                    <p className="text-xs font-bold text-amber-800 dark:text-amber-400">Solicitação Pendente</p>
                    <p className="text-xs text-amber-700 dark:text-amber-300">
                      Sua solicitação de acesso para gerar a Ficha de Qualificação deste apenado está aguardando a aprovação de um Administrador.
                    </p>
                  </div>
                </div>
                <div className="space-y-1">
                  <span className="text-[10px] uppercase font-bold text-subtle tracking-wider">Justificativa enviada:</span>
                  <div className="p-3 bg-gray-50 dark:bg-gray-800/50 border border-gray-150 dark:border-gray-800 rounded-xl text-xs text-body italic">
                    &ldquo;{dossierRequestReason}&rdquo;
                  </div>
                </div>
                <button
                  onClick={() => setShowDossierRequestModal(false)}
                  className="w-full bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-body font-bold py-2.5 rounded-2xl text-xs transition-colors"
                >
                  Fechar
                </button>
              </div>
            ) : (
              <form onSubmit={handleSendDossierRequest} className="space-y-4">
                {dossierRequestStatus === 'REJECTED' && (
                  <div className="p-4 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/30 rounded-2xl flex gap-3">
                    <div className="text-red-500 font-bold">✕</div>
                    <div className="space-y-1">
                      <p className="text-xs font-bold text-red-800 dark:text-red-400">Solicitação Rejeitada</p>
                      <p className="text-xs text-red-700 dark:text-red-300">
                        Sua solicitação anterior foi rejeitada. Você pode enviar uma nova justificativa para avaliação caso seja necessário.
                      </p>
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <p className="text-xs text-body leading-relaxed">
                    A geração de dossiês requer autorização dos administradores. Por favor, forneça uma justificativa/motivo do acesso para solicitar a liberação da Ficha de Qualificação do apenado <strong className="text-sigma-600 dark:text-sigma-400">{apenado.nome}</strong>.
                  </p>
                  <textarea
                    required
                    rows={4}
                    value={dossierJustification}
                    onChange={(e) => setDossierJustification(e.target.value)}
                    placeholder="Ex: Diligência operacional externa solicitada via Ofício X..."
                    className="w-full input-base px-3 py-2 text-xs"
                  />
                </div>

                <div className="flex gap-2">
                  <button
                    type="submit"
                    className="flex-1 bg-sigma-600 hover:bg-sigma-700 text-white font-bold py-2.5 rounded-2xl text-xs transition-all active:scale-95 shadow-md shadow-sigma-600/10"
                  >
                    Solicitar Acesso
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowDossierRequestModal(false)}
                    className="flex-1 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 text-body font-bold py-2.5 rounded-2xl text-xs transition-colors"
                  >
                    Cancelar
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export function AIPanel({
  userRole,
  onViewVinculos,
  onViewMapa,
  mapaRefreshKey = 0,
}: {
  userRole?: string
  onViewVinculos?: (sipeId: number) => void
  onViewMapa?: (apenado: AIPApenado) => void
  mapaRefreshKey?: number
}) {
  const [apenados, setApenados] = useState<AIPApenado[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedApenado, setSelectedApenado] = useState<AIPApenado | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [layout, setLayout] = useState<any>(null)
  const [showLayoutConfig, setShowLayoutConfig] = useState(false)

  const LIMIT = 20

  const fetchLayout = useCallback(async () => {
    try {
      const res = await fetch('/api/aip/layout')
      if (res.ok) {
        const data = await res.json()
        setLayout(data)
      }
    } catch (error) {
      console.error('Erro ao carregar layout:', error)
    }
  }, [])

  useEffect(() => {
    fetchLayout()
  }, [fetchLayout])

  const fetchApenados = useCallback(async (p: number, q: string) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        page: String(p),
        limit: String(LIMIT)
      })
      if (q) params.set('q', q)

      const res = await fetch(`/api/aip/apenados?${params}`)
      if (res.ok) {
        const data = await res.json()
        setApenados(data.apenados)
        setTotal(data.total)
        setTotalPages(data.totalPages)
        setPage(p)
      }
    } catch (error) {
      console.error('Erro ao buscar apenados:', error)
      toast.error('Erro ao carregar apenados')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchApenados(1, searchQuery)
  }, [searchQuery, fetchApenados])

  useEffect(() => {
    if (mapaRefreshKey > 0) fetchApenados(page, searchQuery)
  }, [mapaRefreshKey, fetchApenados, page, searchQuery])

  const handleSearch = (value: string) => {
    setSearchQuery(value)
    setPage(1)
  }

  const handlePageChange = (newPage: number) => {
    fetchApenados(newPage, searchQuery)
  }

  const handleUpdate = (updated: AIPApenado) => {
    setApenados(apenados.map(a => a.id === updated.id ? updated : a))
    setSelectedApenado(updated)
  }

  const handleDelete = async (id: string) => {
    setApenados(apenados.filter(a => a.id !== id))
    setSelectedApenado(null)
    // Recarregar a lista se necessário
    await fetchApenados(page, searchQuery)
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Brain className="w-5 h-5 text-purple-500" />
            Análise de Inteligência Penal
          </h2>
          <p className="text-sm text-gray-500 mt-1">{total} apenado{total !== 1 ? 's' : ''} registrado{total !== 1 ? 's' : ''}</p>
        </div>

        {userRole === 'SUPER_ADMIN' && (
          <button
            onClick={() => setShowLayoutConfig(true)}
            className="flex items-center gap-2 px-3 py-1.5 bg-purple-50 hover:bg-purple-100 dark:bg-purple-950/20 dark:hover:bg-purple-900/30 text-purple-700 dark:text-purple-300 text-xs font-semibold rounded-lg border border-purple-200 dark:border-purple-900/50 transition-colors shadow-sm"
          >
            <Settings className="w-3.5 h-3.5" />
            Configurar Ficha
          </button>
        )}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
        <input
          type="text"
          placeholder="Buscar por nome, CPF, nome da mãe ou vulgo..."
          value={searchQuery}
          onChange={e => handleSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2 text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
        />
      </div>

      {/* Grid de Apenados */}
      {loading ? (
        <div className="flex items-center justify-center h-40 text-gray-400">
          <Loader2 className="w-5 h-5 animate-spin mr-2" /> Carregando...
        </div>
      ) : apenados.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-40 text-gray-400 gap-2">
          <Brain className="w-8 h-8 opacity-30" />
          <p className="text-sm">Nenhum apenado registrado em AIP</p>
          <p className="text-xs">Cadastre apenados do SIPE para começar a análise</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {apenados.map(a => (
              <AIApenadoCard
                key={a.id}
                apenado={a}
                onSelect={setSelectedApenado}
                onViewVinculos={onViewVinculos}
                onViewMapa={onViewMapa}
              />
            ))}
          </div>

          {/* Paginação */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
              <p className="text-xs text-gray-500">
                Página {page} de {totalPages} • {total} registros
              </p>
              <div className="flex gap-1">
                <button
                  onClick={() => handlePageChange(page - 1)}
                  disabled={page <= 1}
                  className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-30 text-gray-600 dark:text-gray-400"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handlePageChange(page + 1)}
                  disabled={page >= totalPages}
                  className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-30 text-gray-600 dark:text-gray-400"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Modal */}
      {selectedApenado && (
        <AIApenadoModal
          apenado={selectedApenado}
          layout={layout}
          onClose={() => setSelectedApenado(null)}
          onUpdate={handleUpdate}
          onDelete={handleDelete}
          userRole={userRole}
        />
      )}

      {/* Modal de Configuração de Layout */}
      {showLayoutConfig && (
        <AIFichaLayoutModal
          layout={layout}
          onClose={() => setShowLayoutConfig(false)}
          onSave={(newLayout) => {
            setLayout(newLayout)
            setShowLayoutConfig(false)
          }}
        />
      )}
    </div>
  )
}

// ── Modal de Configuração de Layout pelo Superadmin ──────────────────
function AIFichaLayoutModal({ layout, onClose, onSave, submitLabel = 'Salvar Layout' }: {
  layout: any
  onClose: () => void
  onSave: (newLayout: any) => void
  submitLabel?: string
}) {
  const [photoStyle, setPhotoStyle] = useState(layout?.photoStyle || 'avatar')
  const [photoFit, setPhotoFit] = useState(layout?.photoFit || 'cover-top')

  const { data: session } = useSession()
  const [watermarkEnabled, setWatermarkEnabled] = useState(true)
  const [watermarkText, setWatermarkText] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('aip_watermark_text')
      if (saved !== null) return saved
    }
    return ''
  })

  useEffect(() => {
    if (typeof window !== 'undefined' && localStorage.getItem('aip_watermark_text') !== null) {
      return
    }

    if (session?.user) {
      const email = session.user.email || ''
      let defaultText = 'CONFIDENCIAL'
      if (email) {
        let hash = 0
        const str = email.toLowerCase().trim()
        for (let i = 0; i < str.length; i++) {
          hash = (hash << 5) - hash + str.charCodeAt(i)
          hash |= 0
        }
        const hex = Math.abs(hash).toString(16).toUpperCase().padStart(8, '0')
        defaultText = `OP-${hex.slice(0, 8)}`
      }
      setWatermarkText(defaultText)
      localStorage.setItem('aip_watermark_text', defaultText)
    }
  }, [session])

  const defaultSections = [
    { id: 'dados_pessoais', title: 'Dados Pessoais (SIPE)', visible: true },
    { id: 'situacao_prisional', title: 'Situação Prisional (SIPE)', visible: true },
    { id: 'endereco_residencial', title: 'Endereço Residencial (SIPE)', visible: true },
    { id: 'advogados', title: 'Advogados (SIPE)', visible: true },
    { id: 'dados_inteligencia', title: 'Dados de Inteligência', visible: false },
    { id: 'visitantes', title: 'Visitantes Cadastrados', visible: true },
    { id: 'vinculos', title: 'Vínculos no Sistema', visible: true }
  ];

  const [sections, setSections] = useState<any[]>(() => {
    let initialSections = layout?.sections || defaultSections;
    const existingIds = new Set(initialSections.map((s: any) => s.id));
    const missingSections = defaultSections.filter(s => !existingIds.has(s.id));
    if (missingSections.length > 0) {
      initialSections = [...initialSections, ...missingSections];
    }
    return initialSections;
  });

  const [saving, setSaving] = useState(false)

  const handleMove = (index: number, direction: 'up' | 'down') => {
    const nextIndex = direction === 'up' ? index - 1 : index + 1
    if (nextIndex < 0 || nextIndex >= sections.length) return

    const updated = [...sections]
    const temp = updated[index]
    updated[index] = updated[nextIndex]
    updated[nextIndex] = temp
    setSections(updated)
  }

  const handleToggleVisible = (index: number) => {
    const updated = [...sections]
    updated[index].visible = !updated[index].visible
    setSections(updated)
  }

  const handleTitleChange = (index: number, newTitle: string) => {
    const updated = [...sections]
    updated[index].title = newTitle
    setSections(updated)
  }

  const handleSave = async () => {
    const isPrinting = submitLabel && submitLabel !== 'Salvar Layout'
    if (isPrinting) {
      onSave({ 
        photoStyle, 
        photoFit, 
        sections,
        watermarkEnabled,
        watermarkText
      })
      return
    }

    setSaving(true)
    try {
      const res = await fetch('/api/aip/layout', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          photoStyle,
          photoFit,
          sections
        })
      })

      if (res.ok) {
        const data = await res.json()
        onSave(data.layout)
        toast.success('Layout da ficha atualizado com sucesso')
      } else {
        toast.error('Erro ao salvar layout')
      }
    } catch (e) {
      console.error(e)
      toast.error('Erro de conexão ao salvar layout')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={(e) => { e.stopPropagation(); onClose(); }}>
      <div 
        className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-xl max-h-[85vh] flex flex-col animate-in fade-in zoom-in-95 duration-200"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-purple-600 dark:text-purple-400" />
            <h2 className="text-lg font-bold text-gray-900 dark:text-white font-semibold">Configurar Layout da Ficha</h2>
          </div>
          <button 
            type="button"
            onClick={onClose} 
            className="p-2 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-xl transition-colors text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300"
            title="Fechar"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="p-6 flex-1 overflow-y-auto space-y-6">
          {/* Estilo da Foto */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-gray-855 dark:text-gray-200">Foto de Perfil do Apenado</h3>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setPhotoStyle('avatar')}
                className={`p-4 rounded-xl border-2 text-left transition-all flex flex-col gap-1.5 ${
                  photoStyle === 'avatar'
                    ? 'border-purple-600 bg-purple-50/10 dark:border-purple-500 dark:bg-purple-950/10'
                    : 'border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700'
                }`}
              >
                <span className="font-semibold text-sm text-gray-900 dark:text-white">Avatar (Padrão)</span>
                <span className="text-xs text-gray-550">Foto pequena recortada ao lado do nome do apenado.</span>
              </button>
              <button
                type="button"
                onClick={() => setPhotoStyle('full')}
                className={`p-4 rounded-xl border-2 text-left transition-all flex flex-col gap-1.5 ${
                  photoStyle === 'full'
                    ? 'border-purple-600 bg-purple-50/10 dark:border-purple-500 dark:bg-purple-950/10'
                    : 'border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700'
                }`}
              >
                <span className="font-semibold text-sm text-gray-900 dark:text-white">Tamanho Real (Destaque)</span>
                <span className="text-xs text-gray-550">Foto original sem recortes, exibida de forma ampla no topo.</span>
              </button>
            </div>
          </div>

          {/* Ajuste/Enquadramento da Foto */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-gray-855 dark:text-gray-200">Ajuste da Foto (Enquadramento)</h3>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setPhotoFit('cover-top')}
                className={`p-3 rounded-xl border-2 text-center transition-all flex flex-col items-center justify-center gap-1.5 ${
                  photoFit === 'cover-top'
                    ? 'border-purple-600 bg-purple-50/10 dark:border-purple-500 dark:bg-purple-950/10'
                    : 'border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700'
                }`}
                title="Mantém a foto inteira em largura, focando na parte superior (rosto)."
              >
                <span className="font-semibold text-xs text-gray-900 dark:text-white">Focar no Rosto (Topo)</span>
              </button>
              <button
                type="button"
                onClick={() => setPhotoFit('contain')}
                className={`p-3 rounded-xl border-2 text-center transition-all flex flex-col items-center justify-center gap-1.5 ${
                  photoFit === 'contain'
                    ? 'border-purple-600 bg-purple-50/10 dark:border-purple-500 dark:bg-purple-950/10'
                    : 'border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700'
                }`}
                title="Mostra a foto inteira sem cortes, mantendo a proporção."
              >
                <span className="font-semibold text-xs text-gray-900 dark:text-white">Ajustar Inteira</span>
              </button>
              <button
                type="button"
                onClick={() => setPhotoFit('cover')}
                className={`p-3 rounded-xl border-2 text-center transition-all flex flex-col items-center justify-center gap-1.5 ${
                  photoFit === 'cover'
                    ? 'border-purple-600 bg-purple-50/10 dark:border-purple-500 dark:bg-purple-950/10'
                    : 'border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700'
                }`}
                title="Corta e centraliza a imagem para preencher a caixa de foto."
              >
                <span className="font-semibold text-xs text-gray-900 dark:text-white">Centralizado</span>
              </button>
            </div>
          </div>

          {/* Reordenação e Visibilidade de Seções */}
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <h3 className="text-sm font-semibold text-gray-855 dark:text-gray-200">Ordem e Visibilidade das Seções</h3>
              <span className="text-xs text-gray-500">Ordene usando as setas</span>
            </div>

            <div className="space-y-2">
              {sections.map((section, index) => (
                <div 
                  key={section.id} 
                  className={`flex items-center gap-3 bg-gray-50/70 dark:bg-gray-800/40 rounded-xl p-3 border transition-all ${
                    section.visible 
                      ? 'border-gray-250 dark:border-gray-800/60' 
                      : 'border-gray-100 dark:border-gray-900 opacity-60'
                  }`}
                >
                  {/* Visibilidade Checkbox */}
                  <button
                    type="button"
                    onClick={() => handleToggleVisible(index)}
                    className={`p-1.5 rounded-lg transition-colors ${
                      section.visible 
                        ? 'text-purple-600 hover:bg-purple-100/50 dark:text-purple-400 dark:hover:bg-purple-950/30' 
                        : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                    }`}
                    title={section.visible ? 'Ocultar Seção' : 'Exibir Seção'}
                  >
                    {section.visible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                  </button>

                  {/* Input Título da Seção */}
                  <input
                    type="text"
                    value={section.title}
                    onChange={(e) => handleTitleChange(index, e.target.value)}
                    disabled={!section.visible}
                    className="flex-1 text-sm bg-transparent border-b border-transparent focus:border-purple-500 hover:border-gray-300 dark:hover:border-gray-700 py-0.5 text-gray-900 dark:text-white focus:outline-none disabled:opacity-50 font-medium"
                  />

                  {/* Botões Ordenação */}
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleMove(index, 'up')}
                      disabled={index === 0}
                      className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-750 disabled:opacity-20 text-gray-600 dark:text-gray-400"
                    >
                      <ArrowUp className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleMove(index, 'down')}
                      disabled={index === sections.length - 1}
                      className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-750 disabled:opacity-20 text-gray-600 dark:text-gray-400"
                    >
                      <ArrowDown className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Marca d'Água (Apenas para geração do relatório) */}
          {submitLabel === 'Gerar Relatório' && layout?.watermark?.enabled !== false && (
            <div className="space-y-3 p-4 bg-purple-50/15 dark:bg-purple-950/5 rounded-xl border border-purple-100/50 dark:border-purple-900/40">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                  <FileText className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                  Marca d'Água no Documento
                </span>
                <button
                  type="button"
                  onClick={() => setWatermarkEnabled(!watermarkEnabled)}
                  className={`relative w-10 h-5.5 rounded-full transition-colors ${
                    watermarkEnabled ? 'bg-purple-600' : 'bg-gray-200 dark:bg-gray-700'
                  }`}
                >
                  <div
                    className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${
                      watermarkEnabled ? 'left-5.5' : 'left-0.5'
                    }`}
                  />
                </button>
              </div>

              {watermarkEnabled && (
                <div className="space-y-2">
                  <label className="block text-xs font-medium text-gray-500">Texto da Marca d'Água</label>
                  <input
                    type="text"
                    value={watermarkText}
                    onChange={(e) => {
                      setWatermarkText(e.target.value)
                      localStorage.setItem('aip_watermark_text', e.target.value)
                    }}
                    placeholder="Ex: CONFIDENCIAL, COPIA 01, etc."
                    className="w-full px-3 py-2 text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-purple-500 focus:border-transparent focus:outline-none"
                  />
                  <p className="text-[10px] text-gray-500">
                    A formatação, transparência e rotação são definidas globalmente pelo superadmin.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="flex-1 px-4 py-2 text-sm font-medium text-white bg-purple-600 rounded-lg hover:bg-purple-700 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : submitLabel === 'Gerar Relatório' ? (
              <FileText className="w-4 h-4" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            {submitLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
