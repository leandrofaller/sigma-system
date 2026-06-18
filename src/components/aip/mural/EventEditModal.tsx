'use client'

import { useState, useEffect } from 'react'
import {
  X,
  Upload,
  Loader2,
  Image as ImageIcon,
  AlertCircle,
  Trash2,
  FileText,
  FileSpreadsheet,
  FileArchive,
  Save,
  Pencil,
} from 'lucide-react'

interface Anexo {
  id: string
  nomeOriginal: string
  tipo: string
  tipoMime: string
  tamanho: number
  eventId: string
}

interface Evento {
  id: string
  titulo: string
  descricao: string | null
  categoria: string | null
  dataEvento: string
  anexos: Anexo[]
}

interface EventEditModalProps {
  evento: Evento
  isOpen: boolean
  onClose: () => void
  onEventUpdated: () => void
}

function getAttachmentIcon(mime: string, tipo: string) {
  const m = mime?.toLowerCase() || ''
  if (m.includes('pdf') || tipo === 'pdf')
    return <FileText className="w-4 h-4 text-red-500 flex-shrink-0" />
  if (m.includes('word') || m.includes('document') || tipo === 'documento')
    return <FileText className="w-4 h-4 text-blue-500 flex-shrink-0" />
  if (m.includes('sheet') || m.includes('excel') || m.includes('xls') || m.includes('csv'))
    return <FileSpreadsheet className="w-4 h-4 text-green-500 flex-shrink-0" />
  if (m.includes('zip') || m.includes('rar') || m.includes('tar') || m.includes('7z'))
    return <FileArchive className="w-4 h-4 text-amber-500 flex-shrink-0" />
  if (m.startsWith('image/'))
    return <ImageIcon className="w-4 h-4 text-amber-500 flex-shrink-0" />
  return <FileText className="w-4 h-4 text-gray-500 flex-shrink-0" />
}

function formatBytes(bytes: number) {
  if (!bytes || bytes === 0) return '0 Bytes'
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

export function EventEditModal({
  evento,
  isOpen,
  onClose,
  onEventUpdated,
}: EventEditModalProps) {
  const [titulo, setTitulo] = useState(evento.titulo)
  const [descricao, setDescricao] = useState(evento.descricao || '')
  const [categoria, setCategoria] = useState(evento.categoria || '')
  const [dataEvento, setDataEvento] = useState(
    new Date(evento.dataEvento).toISOString().split('T')[0]
  )

  // Anexos existentes que serão removidos
  const [anexosParaRemover, setAnexosParaRemover] = useState<string[]>([])
  // Confirmação de remoção de anexo
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null)

  // Novos arquivos a adicionar
  const [novosArquivos, setNovosArquivos] = useState<File[]>([])
  const [isDragging, setIsDragging] = useState(false)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Resetar estado ao abrir com novo evento
  useEffect(() => {
    if (isOpen) {
      setTitulo(evento.titulo)
      setDescricao(evento.descricao || '')
      setCategoria(evento.categoria || '')
      setDataEvento(new Date(evento.dataEvento).toISOString().split('T')[0])
      setAnexosParaRemover([])
      setNovosArquivos([])
      setError('')
      setConfirmRemoveId(null)
    }
  }, [isOpen, evento])

  if (!isOpen) return null

  // Anexos visiveis = originais menos os marcados para remoção
  const anexosVisiveis = evento.anexos.filter((a) => !anexosParaRemover.includes(a.id))

  const toggleRemoverAnexo = (id: string) => {
    setAnexosParaRemover((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    )
    setConfirmRemoveId(null)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = () => setIsDragging(false)

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const files = Array.from(e.dataTransfer.files)
    setNovosArquivos((prev) => [...prev, ...files])
  }

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setNovosArquivos((prev) => [...prev, ...Array.from(e.target.files!)])
    }
  }

  const removerNovoArquivo = (idx: number) =>
    setNovosArquivos((prev) => prev.filter((_, i) => i !== idx))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!titulo.trim()) return
    setLoading(true)
    setError('')

    try {
      // 1. Atualizar dados do evento
      const res = await fetch(`/api/events/${evento.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ titulo, descricao, categoria, dataEvento }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Erro ao atualizar evento')
      }

      // 2. Remover anexos marcados
      for (const anexoId of anexosParaRemover) {
        const delRes = await fetch(`/api/events/${evento.id}/attachments/${anexoId}`, {
          method: 'DELETE',
        })
        if (!delRes.ok) {
          console.warn(`Falha ao remover anexo ${anexoId}`)
        }
      }

      // 3. Fazer upload dos novos arquivos
      for (const arquivo of novosArquivos) {
        const formData = new FormData()
        formData.append('file', arquivo)
        const upRes = await fetch(`/api/events/${evento.id}/attachments`, {
          method: 'POST',
          body: formData,
        })
        if (!upRes.ok) {
          console.warn(`Falha ao fazer upload de ${arquivo.name}`)
        }
      }

      onEventUpdated()
      onClose()
    } catch (err: any) {
      setError(err.message || 'Erro ao salvar alterações')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-2xl w-full max-h-[92vh] overflow-y-auto border border-gray-200 dark:border-gray-700">

        {/* Header */}
        <div className="sticky top-0 flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 z-10">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 bg-amber-100 dark:bg-amber-900/30 rounded-lg">
              <Pencil className="w-4 h-4 text-amber-600 dark:text-amber-400" />
            </div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">
              Editar Ocorrência
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">

          {/* Título */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              Título <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              className="w-full input-base px-3 py-2"
              required
            />
          </div>

          {/* Descrição */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              Descrição
            </label>
            <textarea
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              className="w-full input-base px-3 py-2 h-24 resize-none"
              placeholder="Detalhes da ocorrência..."
            />
          </div>

          {/* Categoria + Data */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                Categoria
              </label>
              <select
                value={categoria}
                onChange={(e) => setCategoria(e.target.value)}
                className="w-full input-base px-3 py-2"
              >
                <option value="">Selecione...</option>
                <option value="Movimento">Movimento</option>
                <option value="Conflito">Conflito</option>
                <option value="Inteligência">Inteligência</option>
                <option value="Segurança">Segurança</option>
                <option value="Administrativo">Administrativo</option>
                <option value="Outro">Outro</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                Data <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={dataEvento}
                onChange={(e) => setDataEvento(e.target.value)}
                className="w-full input-base px-3 py-2"
                required
              />
            </div>
          </div>

          {/* Anexos existentes */}
          {evento.anexos.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                Anexos existentes
                {anexosParaRemover.length > 0 && (
                  <span className="ml-2 text-xs font-normal text-red-500 dark:text-red-400">
                    ({anexosParaRemover.length} marcado(s) para remoção)
                  </span>
                )}
              </h3>
              <div className="space-y-2">
                {evento.anexos.map((anexo) => {
                  const marcado = anexosParaRemover.includes(anexo.id)
                  const confirming = confirmRemoveId === anexo.id
                  const isImage = anexo.tipo === 'foto' || anexo.tipoMime?.startsWith('image/')
                  const imageUrl = `/api/events/${evento.id}/attachments/${anexo.id}`

                  return (
                    <div
                      key={anexo.id}
                      className={`flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg border transition-all ${
                        marcado
                          ? 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-900/50 opacity-60 line-through'
                          : 'bg-gray-50 dark:bg-gray-700/40 border-gray-200 dark:border-gray-700'
                      }`}
                    >
                      {/* Thumbnail ou ícone */}
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        {isImage ? (
                          <img
                            src={imageUrl}
                            alt={anexo.nomeOriginal}
                            className="w-10 h-10 object-cover rounded-md flex-shrink-0 border border-gray-200 dark:border-gray-600"
                          />
                        ) : (
                          <div className="w-10 h-10 flex items-center justify-center bg-white dark:bg-gray-800 rounded-md border border-gray-200 dark:border-gray-600 flex-shrink-0">
                            {getAttachmentIcon(anexo.tipoMime, anexo.tipo)}
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className={`text-sm font-medium truncate ${marcado ? 'text-red-600 dark:text-red-400' : 'text-gray-800 dark:text-gray-200'}`}>
                            {anexo.nomeOriginal}
                          </p>
                          <p className="text-xs text-gray-400 dark:text-gray-500">
                            {formatBytes(anexo.tamanho)}
                          </p>
                        </div>
                      </div>

                      {/* Ação */}
                      {marcado ? (
                        <button
                          type="button"
                          onClick={() => toggleRemoverAnexo(anexo.id)}
                          className="text-xs text-amber-600 dark:text-amber-400 hover:underline font-semibold flex-shrink-0"
                        >
                          Desfazer
                        </button>
                      ) : confirming ? (
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <button
                            type="button"
                            onClick={() => toggleRemoverAnexo(anexo.id)}
                            className="px-2 py-1 text-[11px] font-semibold bg-red-600 hover:bg-red-700 text-white rounded transition"
                          >
                            Confirmar
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmRemoveId(null)}
                            className="px-2 py-1 text-[11px] border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 rounded transition"
                          >
                            Cancelar
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmRemoveId(anexo.id)}
                          className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg transition flex-shrink-0"
                          title="Remover anexo"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Adicionar novos arquivos */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
              Adicionar novos anexos
            </h3>
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`border-2 border-dashed rounded-lg p-5 transition ${
                isDragging
                  ? 'border-amber-500 bg-amber-50 dark:bg-amber-900/20'
                  : 'border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/20'
              }`}
            >
              <div className="flex flex-col items-center gap-2 text-center">
                <Upload className="w-5 h-5 text-amber-500" />
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Arraste arquivos aqui ou{' '}
                  <label
                    htmlFor="edit-file-input"
                    className="text-amber-600 dark:text-amber-400 font-semibold cursor-pointer hover:underline"
                  >
                    clique para selecionar
                  </label>
                </p>
                <input
                  id="edit-file-input"
                  type="file"
                  multiple
                  className="hidden"
                  accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt"
                  onChange={handleFileInput}
                />
              </div>
            </div>

            {/* Novos arquivos selecionados */}
            {novosArquivos.length > 0 && (
              <div className="mt-3 space-y-2">
                {novosArquivos.map((arquivo, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between gap-3 px-3 py-2 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/50 rounded-lg"
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      {arquivo.type.startsWith('image/') ? (
                        <ImageIcon className="w-4 h-4 text-amber-500 flex-shrink-0" />
                      ) : (
                        <Upload className="w-4 h-4 text-amber-500 flex-shrink-0" />
                      )}
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-amber-800 dark:text-amber-200 truncate">
                          {arquivo.name}
                        </p>
                        <p className="text-xs text-amber-600 dark:text-amber-400">
                          {formatBytes(arquivo.size)}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => removerNovoArquivo(idx)}
                      className="p-1 hover:bg-red-100 dark:hover:bg-red-900/30 rounded transition flex-shrink-0"
                    >
                      <X className="w-4 h-4 text-red-500" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Erro */}
          {error && (
            <div className="flex gap-3 p-3 bg-red-50 dark:bg-red-900/20 border border-red-300 dark:border-red-700 rounded-lg">
              <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
            </div>
          )}

          {/* Botões */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="flex-1 px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg font-medium text-sm hover:bg-gray-50 dark:hover:bg-gray-700 transition disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading || !titulo.trim()}
              className="flex-1 px-4 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-semibold text-sm transition disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Salvando...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  Salvar Alterações
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
