'use client'

import { useEffect, useState } from 'react'
import { Loader2, Trash2, Eye, Download, X, FileText, FileSpreadsheet, FileArchive, Calendar } from 'lucide-react'

interface EventListProps {
  mes: string
  categoria: string | null
  refreshTrigger: number
  onEventUpdated: () => void
  diaFilter?: Date | null
  onClearDiaFilter?: () => void
}

function getAttachmentIcon(mime: string, tipo: string) {
  const m = mime.toLowerCase()
  if (m.includes('pdf') || tipo === 'pdf') {
    return <FileText className="w-4 h-4 text-red-500 flex-shrink-0" />
  }
  if (m.includes('word') || m.includes('document') || tipo === 'documento') {
    return <FileText className="w-4 h-4 text-blue-500 flex-shrink-0" />
  }
  if (m.includes('sheet') || m.includes('excel') || m.includes('xls') || m.includes('csv')) {
    return <FileSpreadsheet className="w-4 h-4 text-green-500 flex-shrink-0" />
  }
  if (m.includes('zip') || m.includes('rar') || m.includes('tar') || m.includes('7z')) {
    return <FileArchive className="w-4 h-4 text-amber-500 flex-shrink-0" />
  }
  return <FileText className="w-4 h-4 text-gray-500 flex-shrink-0" />
}

function formatBytes(bytes: number) {
  if (bytes === 0) return '0 Bytes'
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

export function EventList({
  mes,
  categoria,
  refreshTrigger,
  onEventUpdated,
  diaFilter,
  onClearDiaFilter,
}: EventListProps) {
  const [eventos, setEventos] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [activeImage, setActiveImage] = useState<{ url: string; nome: string } | null>(null)
  
  // Controle de exclusão
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  useEffect(() => {
    async function loadEvents() {
      setLoading(true)
      try {
        let url = `/api/events?mes=${mes}`
        if (categoria) url += `&categoria=${categoria}`

        const res = await fetch(url)
        const data = await res.json()
        setEventos(data.eventos || [])
      } catch (err) {
        console.error('Erro ao carregar eventos:', err)
      } finally {
        setLoading(false)
      }
    }

    loadEvents()
  }, [mes, categoria, refreshTrigger])

  const handleDelete = async (id: string) => {
    setDeletingId(id)
    try {
      const res = await fetch(`/api/events/${id}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        throw new Error('Erro ao deletar ocorrência')
      }
      onEventUpdated()
      setConfirmDeleteId(null)
    } catch (err) {
      console.error(err)
      alert('Erro ao tentar deletar o evento.')
    } finally {
      setDeletingId(null)
    }
  }

  // Monitorar tecla ESC para fechar o Lightbox
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setActiveImage(null)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-amber-500" />
      </div>
    )
  }

  // Filtragem local baseada na data
  const eventosFiltrados = eventos.filter((evento) => {
    if (!diaFilter) return true
    const evDateStr = new Date(evento.dataEvento).toISOString().split('T')[0]
    const filterDateStr = new Date(diaFilter).toISOString().split('T')[0]
    return evDateStr === filterDateStr
  })

  return (
    <div className="space-y-4">
      {/* Banner de filtro de dia ativo */}
      {diaFilter && onClearDiaFilter && (
        <div className="flex items-center justify-between p-3.5 bg-amber-50 dark:bg-amber-950/20 border border-amber-200/50 dark:border-amber-900/50 rounded-xl text-sm">
          <div className="flex items-center gap-2 text-amber-800 dark:text-amber-300 font-medium">
            <Calendar className="w-4 h-4 text-amber-500" />
            <span>
              Filtrado por: <strong>{new Date(diaFilter).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}</strong>
            </span>
          </div>
          <button
            onClick={onClearDiaFilter}
            className="text-xs text-amber-600 hover:text-amber-800 dark:text-amber-400 dark:hover:text-amber-200 underline font-semibold transition"
          >
            Ver mês inteiro
          </button>
        </div>
      )}

      {eventosFiltrados.length === 0 ? (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-lg">
          {diaFilter 
            ? 'Nenhum evento encontrado para o dia selecionado.'
            : 'Nenhum evento encontrado para os filtros selecionados.'}
        </div>
      ) : (
        eventosFiltrados.map((evento) => {
          // Separar fotos de outros tipos de arquivos
          const anexosValidos = evento.anexos || []
          const imagens = anexosValidos.filter(
            (anexo: any) => anexo.tipo === 'foto' || anexo.tipoMime?.startsWith('image/')
          )
          const documentos = anexosValidos.filter(
            (anexo: any) => anexo.tipo !== 'foto' && !anexo.tipoMime?.startsWith('image/')
          )

          return (
            <div
              key={evento.id}
              className="p-5 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/40 rounded-xl hover:shadow-md transition duration-200"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  {/* Título e Categoria */}
                  <div className="flex flex-wrap items-center gap-2 mb-1.5">
                    <h3 className="font-semibold text-base text-gray-900 dark:text-white leading-tight">
                      {evento.titulo}
                    </h3>
                    {evento.categoria && (
                      <span className="px-2 py-0.5 text-xs font-semibold bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200/50 dark:border-amber-900/50 rounded-full">
                        {evento.categoria}
                      </span>
                    )}
                  </div>

                  {/* Descrição */}
                  {evento.descricao && (
                    <p className="text-sm text-gray-600 dark:text-gray-300 mt-1 whitespace-pre-line leading-relaxed">
                      {evento.descricao}
                    </p>
                  )}

                  {/* Visualização de Anexos (Imagens) */}
                  {imagens.length > 0 && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2 mt-4">
                      {imagens.map((anexo: any) => {
                        const imageUrl = `/api/events/${evento.id}/attachments/${anexo.id}`
                        return (
                          <div
                            key={anexo.id}
                            onClick={() => setActiveImage({ url: imageUrl, nome: anexo.nomeOriginal })}
                            className="relative aspect-square rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800 cursor-zoom-in group"
                          >
                            <img
                              src={imageUrl}
                              alt={anexo.nomeOriginal}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                              loading="lazy"
                            />
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                              <Eye className="w-5 h-5 text-white" />
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {/* Visualização de Anexos (Documentos) */}
                  {documentos.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-3">
                      {documentos.map((anexo: any) => {
                        const docUrl = `/api/events/${evento.id}/attachments/${anexo.id}`
                        return (
                          <a
                            key={anexo.id}
                            href={docUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 hover:bg-gray-100 dark:bg-gray-800 dark:hover:bg-gray-700/60 border border-gray-200 dark:border-gray-700 rounded-lg text-xs text-gray-700 dark:text-gray-300 transition group"
                          >
                            {getAttachmentIcon(anexo.tipoMime, anexo.tipo)}
                            <span className="max-w-[150px] sm:max-w-[250px] truncate font-medium text-gray-800 dark:text-gray-200" title={anexo.nomeOriginal}>
                              {anexo.nomeOriginal}
                            </span>
                            <span className="text-gray-400 dark:text-gray-500 font-mono text-[10px]">
                              ({formatBytes(anexo.tamanho)})
                            </span>
                            <Download className="w-3.5 h-3.5 text-gray-400 group-hover:text-amber-600 dark:group-hover:text-amber-400 transition" />
                          </a>
                        )
                      })}
                    </div>
                  )}

                  {/* Metadados e Rodapé */}
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-4 pt-3 border-t border-gray-100 dark:border-gray-800/80 text-xs text-gray-400 dark:text-gray-500">
                    <span className="font-medium text-gray-500 dark:text-gray-400">
                      {new Date(evento.dataEvento).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}
                    </span>
                    <span>•</span>
                    <span>{anexosValidos.length} anexo(s)</span>
                    {evento.criadoByUser && (
                      <>
                        <span>•</span>
                        <span>Registrado por: {evento.criadoByUser.name}</span>
                      </>
                    )}
                  </div>
                </div>

                {/* Ações de exclusão */}
                <div className="flex-shrink-0 self-start">
                  {confirmDeleteId === evento.id ? (
                    <div className="flex items-center gap-1.5 bg-red-50 dark:bg-red-950/20 p-1.5 rounded-lg border border-red-200 dark:border-red-900/50">
                      <button
                        onClick={() => handleDelete(evento.id)}
                        disabled={deletingId === evento.id}
                        className="px-2.5 py-1 bg-red-600 hover:bg-red-700 text-white rounded font-semibold text-[11px] flex items-center gap-1 transition disabled:opacity-50"
                      >
                        {deletingId === evento.id ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          'Confirmar'
                        )}
                      </button>
                      <button
                        onClick={() => setConfirmDeleteId(null)}
                        className="px-2.5 py-1 border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 rounded font-medium text-[11px] transition"
                      >
                        Cancelar
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmDeleteId(evento.id)}
                      className="p-2 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg transition text-gray-400 hover:text-red-500"
                      title="Excluir ocorrência"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          )
        })
      )}

      {/* Lightbox / Visualizador de Imagens */}
      {activeImage && (
        <div
          className="fixed inset-0 bg-black/90 flex flex-col items-center justify-center z-[100] p-4 cursor-zoom-out"
          onClick={() => setActiveImage(null)}
        >
          {/* Botão de Fechar */}
          <button
            onClick={() => setActiveImage(null)}
            className="absolute top-4 right-4 p-2 bg-gray-800/80 hover:bg-gray-700/85 text-white rounded-full transition cursor-pointer"
            title="Fechar (Esc)"
          >
            <X className="w-6 h-6" />
          </button>

          {/* Imagem Ampliada */}
          <img
            src={activeImage.url}
            alt={activeImage.nome}
            className="max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl"
            onClick={(e) => e.stopPropagation()} // impede fechar ao clicar na imagem em si
          />

          {/* Rodapé com nome do arquivo */}
          <div
            className="mt-4 px-4 py-2 bg-gray-800/60 text-white text-sm rounded-lg backdrop-blur-sm"
            onClick={(e) => e.stopPropagation()}
          >
            {activeImage.nome}
          </div>
        </div>
      )}
    </div>
  )
}
