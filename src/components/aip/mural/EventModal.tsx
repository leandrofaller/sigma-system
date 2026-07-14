'use client'

import { useState } from 'react'
import { X, Upload, Loader2, Image as ImageIcon, AlertCircle } from 'lucide-react'

interface EventModalProps {
  isOpen: boolean
  onClose: () => void
  onEventCreated: () => void
  initialDate?: Date
}

export function EventModal({ isOpen, onClose, onEventCreated, initialDate }: EventModalProps) {
  const [titulo, setTitulo] = useState('')
  const [descricao, setDescricao] = useState('')
  const [categoria, setCategoria] = useState('')
  const [dataEvento, setDataEvento] = useState(
    initialDate?.toISOString().split('T')[0] || new Date().toISOString().split('T')[0]
  )

  const [arquivos, setArquivos] = useState<File[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  if (!isOpen) return null

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = () => {
    setIsDragging(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)

    const files = Array.from(e.dataTransfer.files)
    adicionarArquivos(files)
  }

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files)
      adicionarArquivos(files)
    }
  }

  const adicionarArquivos = (files: File[]) => {
    setArquivos((prev) => [...prev, ...files])
    setError('')
  }

  const removerArquivo = (idx: number) => {
    setArquivos((prev) => prev.filter((_, i) => i !== idx))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      // 1. Criar evento
      const eventoRes = await fetch('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          titulo,
          descricao,
          categoria,
          dataEvento,
        }),
      })

      if (!eventoRes.ok) {
        throw new Error('Erro ao criar evento')
      }

      const evento = await eventoRes.json()

      // 2. Upload de arquivos (se houver)
      if (arquivos.length > 0) {
        const formData = new FormData()
        for (const arquivo of arquivos) {
          formData.append('file', arquivo)
        }

        const uploadRes = await fetch(`/api/events/${evento.id}/attachments`, {
          method: 'POST',
          body: formData,
        })

        if (!uploadRes.ok) {
          const data = await uploadRes.json().catch(() => ({}))
          throw new Error(data.error || 'Erro ao fazer upload de um ou mais anexos')
        }
      }

      onEventCreated()
      onClose()
    } catch (err: any) {
      setError(err.message || 'Erro ao criar evento')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Novo Evento</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-xl transition-colors text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300"
            title="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Campos de texto */}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Título *
              </label>
              <input
                type="text"
                value={titulo}
                onChange={(e) => setTitulo(e.target.value)}
                placeholder="Ex: Movimento de presos, Conflito, etc"
                className="w-full input-base px-3 py-2"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Descrição
              </label>
              <textarea
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                placeholder="Detalhes do evento..."
                className="w-full input-base px-3 py-2 h-24"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Categoria
                </label>
                <select value={categoria} onChange={(e) => setCategoria(e.target.value)} className="w-full input-base px-3 py-2">
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
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Data *
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
          </div>

          {/* Drag & Drop */}
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`
              border-2 border-dashed rounded-lg p-6 transition
              ${
                isDragging
                  ? 'border-amber-500 bg-amber-50 dark:bg-amber-900/20'
                  : 'border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/30'
              }
            `}
          >
            <div className="flex flex-col items-center justify-center gap-3">
              <div className="p-3 bg-amber-100 dark:bg-amber-900/30 rounded-lg">
                <Upload className="w-6 h-6 text-amber-600 dark:text-amber-400" />
              </div>
              <div className="text-center">
                <p className="font-medium text-gray-900 dark:text-white">
                  Arraste fotos ou documentos aqui
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  ou clique para selecionar
                </p>
              </div>
              <input
                type="file"
                multiple
                onChange={handleFileInput}
                className="hidden"
                id="file-input"
                accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt"
              />
              <label
                htmlFor="file-input"
                className="mt-3 px-4 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-sm font-medium cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-600 transition"
              >
                Selecionar Arquivos
              </label>
            </div>
          </div>

          {/* Lista de arquivos */}
          {arquivos.length > 0 && (
            <div className="space-y-3">
              <h3 className="font-medium text-gray-900 dark:text-white">
                {arquivos.length} arquivo(s) selecionado(s)
              </h3>
              <div className="space-y-2">
                {arquivos.map((arquivo, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg"
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      {arquivo.type.startsWith('image/') ? (
                        <ImageIcon className="w-4 h-4 text-amber-500 flex-shrink-0" />
                      ) : (
                        <Upload className="w-4 h-4 text-gray-500 flex-shrink-0" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                          {arquivo.name}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {(arquivo.size / 1024 / 1024).toFixed(2)} MB
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => removerArquivo(idx)}
                      className="p-1 hover:bg-red-100 dark:hover:bg-red-900/30 rounded transition"
                    >
                      <X className="w-4 h-4 text-red-500" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Erro */}
          {error && (
            <div className="flex gap-3 p-3 bg-red-50 dark:bg-red-900/20 border border-red-300 dark:border-red-700 rounded-lg">
              <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0" />
              <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
            </div>
          )}

          {/* Buttons */}
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading || !titulo}
              className="flex-1 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-medium transition disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {loading ? 'Criando...' : 'Criar Evento'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
