'use client'

import { useState, useEffect, useCallback } from 'react'
import { Search, ChevronLeft, ChevronRight, Briefcase, Users, Phone, Shield, Camera, Printer } from 'lucide-react'
import { toast } from 'sonner'
import { ApenadoModal } from './ApenadosImportados'

interface Faccao { nome: string; sigla: string | null; cor: string }
interface Alcunha { alcunha: string }
interface ApenadoResumido {
  id: string
  nome: string
  cpf: string | null
  regime: string | null
  unidade: string | null
  cela: string | null
  faccao: Faccao | null
  alcunhas: Alcunha[]
}
interface VinculoApenado { apenado: ApenadoResumido }
interface Advogado {
  id: string
  sipeId: number
  nome: string
  oab: string | null
  cpf: string | null
  telefone: string | null
  endereco: string | null
  photoPath: string | null
  dataCadastro: string | null
  vinculos: VinculoApenado[]
}

const getPhotoUrl = (path: string) => {
  if (path.startsWith('uploads/')) {
    return `/api/${path}`;
  }
  return `/api/uploads/${path}`;
};

function AdvogadoCard({ advogado, onClick }: { advogado: Advogado; onClick: () => void }) {
  const faccoesDosClientes = [...new Map(
    advogado.vinculos
      .filter(v => v.apenado.faccao)
      .map(v => [v.apenado.faccao!.nome, v.apenado.faccao!])
  ).values()]

  return (
    <div
      onClick={onClick}
      className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 hover:border-blue-300 dark:hover:border-blue-700 hover:shadow-md transition-all cursor-pointer"
    >
      <div className="flex items-start gap-3">
        {advogado.photoPath ? (
          <img
            src={getPhotoUrl(advogado.photoPath)}
            alt={advogado.nome}
            className="w-10 h-10 rounded-xl object-cover shrink-0 border border-gray-100 dark:border-gray-700/50"
          />
        ) : (
          <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-xl flex items-center justify-center shrink-0">
            <Briefcase className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-900 dark:text-white text-sm truncate">{advogado.nome}</p>
          <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-500">
            {advogado.oab && <span>OAB {advogado.oab}</span>}
            {advogado.telefone && (
              <span className="flex items-center gap-1">
                <Phone className="w-3 h-3" />{advogado.telefone}
              </span>
            )}
          </div>
          <div className="mt-2 flex items-center gap-2 flex-wrap">
            <span className="flex items-center gap-1 text-xs text-gray-500">
              <Users className="w-3 h-3" />
              {advogado.vinculos.length} cliente{advogado.vinculos.length !== 1 ? 's' : ''}
            </span>
            {faccoesDosClientes.map(f => (
              <span
                key={f.nome}
                className="px-1.5 py-0.5 rounded text-xs font-semibold text-white"
                style={{ backgroundColor: f.cor || '#ef4444' }}
              >
                {f.sigla || f.nome}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function AdvogadoModal({
  advogado,
  onClose,
  onApenadoClick,
  onPhotoUpdate,
}: {
  advogado: Advogado
  onClose: () => void
  onApenadoClick: (id: string) => void
  onPhotoUpdate?: (photoPath: string) => void
}) {
  const [zoomedPhotoUrl, setZoomedPhotoUrl] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    const formData = new FormData()
    formData.append('file', file)

    try {
      const res = await fetch(`/api/sipe/advogados/${advogado.id}/foto`, {
        method: 'POST',
        body: formData,
      })

      const data = await res.json()
      if (res.ok) {
        toast.success('Foto atualizada com sucesso!')
        if (onPhotoUpdate) {
          onPhotoUpdate(data.photoPath)
        }
      } else {
        toast.error(data.error || 'Erro ao atualizar foto')
      }
    } catch {
      toast.error('Erro de conexão ao enviar imagem')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-y-auto flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-4 flex-1 min-w-0">
              <div className="flex flex-col items-center gap-2 shrink-0">
                {advogado.photoPath ? (
                  <img
                    src={getPhotoUrl(advogado.photoPath)}
                    alt={advogado.nome}
                    onClick={() => setZoomedPhotoUrl(getPhotoUrl(advogado.photoPath!))}
                    className="w-24 h-32 rounded-xl object-cover border-2 border-gray-200 dark:border-gray-700 shadow-md cursor-zoom-in hover:opacity-90 active:scale-95 transition-all duration-200"
                    title="Clique para ver em tamanho real"
                  />
                ) : (
                  <div className="w-24 h-32 bg-blue-100 dark:bg-blue-900/30 rounded-xl flex flex-col items-center justify-center border-2 border-dashed border-blue-200 dark:border-blue-800">
                    <Briefcase className="w-8 h-8 text-blue-600 dark:text-blue-400 mb-1" />
                    <span className="text-[10px] text-blue-500 font-semibold">Sem Foto</span>
                  </div>
                )}
                
                <label className="flex items-center gap-1 px-2 py-1 text-[10px] font-semibold text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 bg-blue-50 dark:bg-blue-950/30 rounded-md border border-blue-100 dark:border-blue-900/30 cursor-pointer transition-colors mt-1">
                  <Camera className="w-3 h-3" />
                  {advogado.photoPath ? 'Alterar Foto' : 'Anexar Foto'}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleFileChange}
                    disabled={uploading}
                  />
                </label>
                {uploading && <span className="text-[9px] text-gray-500 animate-pulse">Enviando...</span>}
              </div>
              <div className="flex-1 min-w-0 pt-1">
                <h2 className="text-xl font-bold text-gray-900 dark:text-white leading-tight">{advogado.nome}</h2>
                <div className="flex flex-col gap-1.5 text-sm text-gray-500 dark:text-gray-400 mt-3">
                  {advogado.oab && (
                    <span className="flex items-center gap-2">
                      <span className="font-semibold text-gray-700 dark:text-gray-300">OAB:</span>
                      <span className="px-2 py-0.5 bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 rounded-md text-xs font-semibold border border-blue-100 dark:border-blue-900/40">{advogado.oab}</span>
                    </span>
                  )}
                  {advogado.cpf && (
                    <span className="flex items-center gap-2">
                      <span className="font-semibold text-gray-700 dark:text-gray-300">CPF:</span>
                      <span className="font-mono text-xs text-gray-700 dark:text-gray-300">{advogado.cpf}</span>
                    </span>
                  )}
                  {advogado.telefone && (
                    <span className="flex items-center gap-2">
                      <span className="font-semibold text-gray-700 dark:text-gray-300">Telefone:</span>
                      <span className="text-gray-700 dark:text-gray-300">{advogado.telefone}</span>
                    </span>
                  )}
                  {advogado.dataCadastro && (
                    <span className="flex items-center gap-2">
                      <span className="font-semibold text-gray-700 dark:text-gray-300">Cadastrado em:</span>
                      <span className="text-gray-700 dark:text-gray-300">{advogado.dataCadastro}</span>
                    </span>
                  )}
                </div>
              </div>
            </div>
            <button 
              onClick={onClose} 
              className="p-2 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-xl transition-colors text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300 shrink-0"
              title="Fechar"
            >
              ✕
            </button>
          </div>
        </div>

        {advogado.endereco && (
          <div className="p-6 border-b border-gray-100 dark:border-gray-700/50">
            <div className="space-y-1 text-sm">
              <span className="font-semibold text-gray-700 dark:text-gray-300">Endereço Profissional:</span>
              <p className="text-gray-600 dark:text-gray-400 leading-relaxed bg-gray-50 dark:bg-gray-700/20 p-3 rounded-lg border border-gray-200/50 dark:border-gray-700/30">{advogado.endereco}</p>
            </div>
          </div>
        )}

        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2">
              <Users className="w-4 h-4" />
              Clientes ({advogado.vinculos.length})
            </h3>
          </div>

          {advogado.vinculos.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">Nenhum cliente vinculado</p>
          ) : (
            <div className="space-y-2">
              {advogado.vinculos.map(v => (
                <div key={v.apenado.id} className="flex items-center gap-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
                  <div className="flex-1 min-w-0">
                    <button
                      onClick={() => onApenadoClick(v.apenado.id)}
                      className="text-sm font-semibold text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 text-left hover:underline truncate block"
                    >
                      {v.apenado.nome}
                    </button>
                    {v.apenado.alcunhas.length > 0 && (
                      <p className="text-xs text-gray-500">{v.apenado.alcunhas.map(a => `"${a.alcunha}"`).join(', ')}</p>
                    )}
                    <div className="flex items-center gap-2 mt-1 text-xs text-gray-500">
                      {v.apenado.regime && <span>{v.apenado.regime}</span>}
                      {v.apenado.unidade && <span className="truncate">{v.apenado.unidade}</span>}
                    </div>
                  </div>
                  {v.apenado.faccao && (
                    <span
                      className="shrink-0 px-2 py-0.5 rounded-full text-xs font-bold text-white"
                      style={{ backgroundColor: v.apenado.faccao.cor || '#ef4444' }}
                    >
                      {v.apenado.faccao.sigla || v.apenado.faccao.nome}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Lightbox para zoom da foto do advogado */}
      {zoomedPhotoUrl && (
        <div
          className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black/90 backdrop-blur-md cursor-zoom-out p-4"
          onClick={() => setZoomedPhotoUrl(null)}
        >
          <div className="relative max-w-3xl max-h-[90vh] flex flex-col items-center gap-4 animate-in fade-in zoom-in-95 duration-200">
            <img
              src={zoomedPhotoUrl}
              alt={advogado.nome}
              className="max-w-full max-h-[80vh] object-contain rounded-xl shadow-2xl border border-gray-800"
            />
            <div className="bg-black/60 text-white px-4 py-2 rounded-full text-sm font-semibold backdrop-blur-sm">
              {advogado.nome} {advogado.oab ? `(OAB ${advogado.oab})` : ''}
            </div>
            <button
              className="absolute top-4 right-4 bg-red-600 hover:bg-red-700 text-white p-2 rounded-full transition-colors backdrop-blur-sm"
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
    </div>
  )
}

export function AdvogadosImportados() {
  const [advogados, setAdvogados] = useState<Advogado[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<Advogado | null>(null)
  const [selectedApenado, setSelectedApenado] = useState<any | null>(null)
  const [loadingApenado, setLoadingApenado] = useState(false)

  const handlePhotoUpdate = (advogadoId: string, newPhotoPath: string) => {
    setAdvogados(prev => prev.map(a => a.id === advogadoId ? { ...a, photoPath: newPhotoPath } : a))
    if (selected && selected.id === advogadoId) {
      setSelected(prev => prev ? { ...prev, photoPath: newPhotoPath } : null)
    }
  }

  const [unidadesList, setUnidadesList] = useState<Array<{ id: string; nome: string }>>([])
  const [selectedUnidade, setSelectedUnidade] = useState<string>('')
  const [faccoesList, setFaccoesList] = useState<Array<{ id: string; nome: string; sigla: string | null }>>([])
  const [selectedFaccao, setSelectedFaccao] = useState<string>('')

  useEffect(() => {
    const fetchUnidades = async () => {
      try {
        const res = await fetch('/api/sipe/unidades')
        if (res.ok) {
          const data = await res.json()
          setUnidadesList(data.unidades || [])
        }
      } catch (e) {
        console.error('Erro ao buscar unidades:', e)
      }
    }
    const fetchFaccoes = async () => {
      try {
        const res = await fetch('/api/sipe/faccoes')
        if (res.ok) {
          const data = await res.json()
          setFaccoesList(data || [])
        }
      } catch (e) {
        console.error('Erro ao buscar facções:', e)
      }
    }
    fetchUnidades()
    fetchFaccoes()
  }, [])

  const generatePrintHtml = (unidadeNome: string, faccaoId: string, advs: Advogado[]): string => {
    const dataFormatada = new Date().toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })

    const faccaoNome = faccaoId === 'qualquer'
      ? 'Membros de Facção (Qualquer)'
      : faccaoId
      ? (faccoesList.find(f => f.id === faccaoId)?.sigla || faccoesList.find(f => f.id === faccaoId)?.nome || 'Facção Selecionada')
      : 'Todas as Facções'

    const unidadeNomeHeader = unidadeNome || 'Todas as Unidades'

    let rowsHtml = ''
    advs.forEach(adv => {
      const oabStr = adv.oab ? `OAB: ${adv.oab}` : 'OAB: Não cadastrado'
      const telStr = adv.telefone ? `Tel: ${adv.telefone}` : 'Tel: Não cadastrado'
      const endStr = adv.endereco ? `<div class="address">Endereço: ${adv.endereco}</div>` : ''
      
      let clientesHtml = ''
      if (adv.vinculos.length === 0) {
        clientesHtml = '<p class="no-clients">Nenhum cliente ativo vinculado nos filtros aplicados.</p>'
      } else {
        clientesHtml = `
          <table class="clients-table">
            <thead>
              <tr>
                <th style="width: 30%;">Nome do Apenado</th>
                <th style="width: 25%;">Unidade Prisional</th>
                <th style="width: 15%;">Regime</th>
                <th style="width: 15%;">Cela</th>
                <th style="width: 15%;">Facção</th>
              </tr>
            </thead>
            <tbody>
              ${adv.vinculos.map(v => `
                <tr>
                  <td class="client-name">${v.apenado.nome}</td>
                  <td>${v.apenado.unidade || 'Não cadastrada'}</td>
                  <td>${v.apenado.regime || '-'}</td>
                  <td>${v.apenado.cela || '-'}</td>
                  <td>
                    ${v.apenado.faccao ? `
                      <span class="fac-tag" style="border-left: 3px solid ${v.apenado.faccao.cor || '#ff0000'}">
                        ${v.apenado.faccao.sigla || v.apenado.faccao.nome}
                      </span>
                    ` : '-'}
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        `
      }

      rowsHtml += `
        <div class="adv-card">
          <div class="adv-header">
            <span class="adv-name">${adv.nome}</span>
            <span class="adv-meta">${oabStr} | ${telStr}</span>
          </div>
          ${endStr}
          <div class="clients-section">
            <div class="section-title">Clientes Atendidos:</div>
            ${clientesHtml}
          </div>
        </div>
      `
    })

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>Relatório de Advogados - ${unidadeNome}</title>
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
              color: #333;
              margin: 30px;
              font-size: 13px;
              line-height: 1.4;
            }
            .header {
              border-bottom: 2px solid #333;
              padding-bottom: 15px;
              margin-bottom: 25px;
            }
            .header-title {
              font-size: 18px;
              font-weight: bold;
              margin: 0 0 5px 0;
              text-transform: uppercase;
            }
            .header-meta {
              font-size: 12px;
              color: #666;
              margin: 0;
            }
            .adv-card {
              margin-bottom: 30px;
              page-break-inside: avoid;
              border: 1px solid #ddd;
              border-radius: 6px;
              padding: 15px;
              background-color: #fafafa;
            }
            .adv-header {
              display: flex;
              justify-content: space-between;
              align-items: baseline;
              border-bottom: 1px dashed #ccc;
              padding-bottom: 8px;
              margin-bottom: 10px;
            }
            .adv-name {
              font-size: 14px;
              font-weight: bold;
              color: #111;
              text-transform: uppercase;
            }
            .adv-meta {
              font-size: 11px;
              color: #444;
              margin-left: 15px;
            }
            .address {
              font-size: 11px;
              color: #555;
              margin-bottom: 12px;
              font-style: italic;
            }
            .clients-section {
              margin-top: 10px;
            }
            .section-title {
              font-size: 11px;
              font-weight: bold;
              color: #555;
              margin-bottom: 6px;
              text-transform: uppercase;
            }
            .clients-table {
              width: 100%;
              border-collapse: collapse;
              margin-top: 5px;
              background-color: #fff;
            }
            .clients-table th, .clients-table td {
              border: 1px solid #e0e0e0;
              padding: 6px 10px;
              text-align: left;
              font-size: 11px;
            }
            .clients-table th {
              background-color: #f0f0f0;
              font-weight: bold;
            }
            .client-name {
              font-weight: 600;
            }
            .no-clients {
              font-size: 11px;
              color: #777;
              font-style: italic;
              margin: 5px 0 0 0;
            }
            .fac-tag {
              padding-left: 6px;
              font-weight: bold;
            }
            @media print {
              body {
                margin: 15px;
                font-size: 11px;
              }
              .adv-card {
                border: none;
                padding: 0;
                margin-bottom: 25px;
                background-color: transparent;
                border-bottom: 1px solid #ccc;
                border-radius: 0;
                padding-bottom: 15px;
              }
              .clients-table th {
                background-color: #f5f5f5 !important;
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
              }
              .adv-name {
                font-size: 12px;
              }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <h1 class="header-title">Relatório de Advogados e Clientes Vinculados</h1>
            <p class="header-meta">
              <strong>Unidade Prisional:</strong> ${unidadeNomeHeader} | 
              <strong>Filtro Facção:</strong> ${faccaoNome} | 
              <strong>Gerado em:</strong> ${dataFormatada} | 
              <strong>Total:</strong> ${advs.length} advogado(s)
            </p>
          </div>
          <div class="content">
            ${rowsHtml}
          </div>
        </body>
      </html>
    `
  }

  const handlePrintReport = async () => {
    if (!selectedUnidade && !selectedFaccao) return
    
    const printToastId = toast.loading('Gerando relatório de impressão...')
    try {
      const params = new URLSearchParams({ limit: '1000' })
      if (q) params.set('q', q)
      if (selectedUnidade) params.set('unidade', selectedUnidade)
      if (selectedFaccao) params.set('faccao', selectedFaccao)

      const res = await fetch(`/api/sipe/advogados?${params}`)
      if (!res.ok) throw new Error('Erro ao buscar advogados')
      
      const data = await res.json()
      const advsToPrint = data.advogados as Advogado[]

      if (advsToPrint.length === 0) {
        toast.dismiss(printToastId)
        toast.error('Nenhum advogado encontrado para os filtros selecionados')
        return
      }

      const printWindow = window.open('', '_blank')
      if (!printWindow) {
        toast.dismiss(printToastId)
        toast.error('Bloqueador de pop-ups impediu a abertura do relatório')
        return
      }

      const htmlContent = generatePrintHtml(selectedUnidade, selectedFaccao, advsToPrint)
      printWindow.document.write(htmlContent)
      printWindow.document.close()
      
      printWindow.focus()
      setTimeout(() => {
        printWindow.print()
      }, 500)

      toast.dismiss(printToastId)
    } catch (err) {
      console.error(err)
      toast.dismiss(printToastId)
      toast.error('Falha ao gerar o relatório para impressão')
    }
  }

  const handleApenadoClick = async (apenadoId: string) => {
    setLoadingApenado(true)
    try {
      const res = await fetch(`/api/sipe/apenados/${apenadoId}`)
      if (res.ok) {
        const data = await res.json()
        setSelectedApenado(data)
      } else {
        toast.error('Erro ao buscar detalhes do apenado')
      }
    } catch {
      toast.error('Erro de conexão ao buscar apenado')
    } finally {
      setLoadingApenado(false)
    }
  }

  const fetchAdvogados = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams({ page: String(page), limit: '24' })
    if (q) params.set('q', q)
    if (selectedUnidade) params.set('unidade', selectedUnidade)
    if (selectedFaccao) params.set('faccao', selectedFaccao)

    const res = await fetch(`/api/sipe/advogados?${params}`)
    if (res.ok) {
      const data = await res.json()
      setAdvogados(data.advogados)
      setTotal(data.total)
      setTotalPages(data.totalPages)
    }
    setLoading(false)
  }, [page, q, selectedUnidade, selectedFaccao])

  useEffect(() => { fetchAdvogados() }, [fetchAdvogados])

  const [syncingCna, setSyncingCna] = useState(false)
  const [activeCnaJob, setActiveCnaJob] = useState<any>(null)
  const [isAnyJobActive, setIsAnyJobActive] = useState(false)

  const checkSyncJobs = useCallback(async () => {
    try {
      const res = await fetch('/api/sipe/sync')
      if (res.ok) {
        const jobsList = await res.json()
        const anyRunning = jobsList.some((j: any) => j.status === 'RUNNING')
        const runningCna = jobsList.find((j: any) => j.status === 'RUNNING' && j.tipo === 'ADVOGADOS_CNA')
        
        setIsAnyJobActive(anyRunning)
        
        // Se o job terminou (estava ativo e agora não está mais), recarrega a lista
        if (activeCnaJob && !runningCna) {
          fetchAdvogados()
        }
        
        setActiveCnaJob(runningCna || null)
      }
    } catch (e) {
      console.error('Erro ao verificar jobs ativos:', e)
    }
  }, [activeCnaJob, fetchAdvogados])

  useEffect(() => {
    checkSyncJobs()
    const interval = setInterval(checkSyncJobs, 3000)
    return () => clearInterval(interval)
  }, [checkSyncJobs])

  const handleSyncCna = async () => {
    setSyncingCna(true)
    try {
      const res = await fetch('/api/sipe/advogados/sync-cna-all', { method: 'POST' })
      const data = await res.json()
      if (res.ok) {
        toast.success(data.message || 'Sincronização iniciada com sucesso!')
        checkSyncJobs()
      } else {
        toast.error(data.error || 'Erro ao iniciar sincronização')
      }
    } catch {
      toast.error('Erro de conexão com o servidor')
    } finally {
      setSyncingCna(false)
    }
  }

  return (
    <div className="flex flex-col h-full min-h-0 gap-4">
      <div className="flex flex-wrap gap-3 items-center justify-between">
        <div className="flex flex-wrap gap-3 items-center flex-1 min-w-48">
          <div className="flex-1 max-w-md relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar por nome, OAB ou CPF..."
              value={q}
              onChange={e => { setQ(e.target.value); setPage(1) }}
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <select
            value={selectedUnidade}
            onChange={e => { setSelectedUnidade(e.target.value); setPage(1) }}
            className="text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white py-2 px-3 focus:ring-2 focus:ring-blue-500 focus:border-transparent max-w-xs truncate cursor-pointer"
          >
            <option value="">Todas as Unidades Prisionais</option>
            {unidadesList.map(u => {
              const nomeExibicao = u.nome.replace(/^\d+\s*-\s*/, '')
              return (
                <option key={u.id} value={u.nome}>
                  {nomeExibicao}
                </option>
              )
            })}
          </select>

          <select
            value={selectedFaccao}
            onChange={e => { setSelectedFaccao(e.target.value); setPage(1) }}
            className="text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white py-2 px-3 focus:ring-2 focus:ring-blue-500 focus:border-transparent max-w-xs truncate cursor-pointer"
          >
            <option value="">Todas as Facções</option>
            <option value="qualquer">Atendem Faccionados (Qualquer)</option>
            {faccoesList.map(f => (
              <option key={f.id} value={f.id}>
                {f.sigla ? `${f.sigla} - ${f.nome}` : f.nome}
              </option>
            ))}
          </select>

          <span className="text-sm text-gray-500">{total} advogado{total !== 1 ? 's' : ''}</span>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {(selectedUnidade || selectedFaccao) && (
            <button
              onClick={handlePrintReport}
              disabled={loading || advogados.length === 0}
              className="flex items-center gap-1.5 px-4 py-2 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 rounded-lg text-sm font-semibold transition-colors shadow-sm"
              title="Gerar relatório para impressão com os filtros aplicados"
            >
              <Printer className="w-4 h-4" />
              Imprimir Relatório
            </button>
          )}

          <div className="flex flex-col items-end gap-1">
            <button
              onClick={handleSyncCna}
              disabled={syncingCna || (isAnyJobActive && !activeCnaJob)}
              className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded-lg text-sm font-semibold transition-colors shadow-sm"
            >
            {syncingCna || activeCnaJob ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
            ) : (
              <Users className="w-4 h-4" />
            )}
            {activeCnaJob
              ? `Sincronizando CNA (${activeCnaJob.processado}/${activeCnaJob.total ?? '?'})`
              : isAnyJobActive
              ? 'Sincronizador Ocupado'
              : 'Sincronizar Fotos/Dados (CNA)'}
          </button>
          
          {activeCnaJob && (
            <span className="text-[10px] text-gray-500 animate-pulse">
              Acompanhe os logs na aba Sincronização
            </span>
          )}
        </div>
      </div>
    </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-40 text-gray-400">Carregando...</div>
        ) : advogados.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-gray-400 gap-2">
            <Shield className="w-8 h-8 opacity-30" />
            <p className="text-sm">Nenhum advogado importado ainda</p>
            <p className="text-xs">Os advogados são importados automaticamente junto com os apenados</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {advogados.map(a => (
              <AdvogadoCard key={a.id} advogado={a} onClick={() => setSelected(a)} />
            ))}
          </div>
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-40 transition-colors">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm text-gray-600 dark:text-gray-400">Página {page} de {totalPages}</span>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-40 transition-colors">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {selected && (
        <AdvogadoModal
          advogado={selected}
          onClose={() => setSelected(null)}
          onApenadoClick={handleApenadoClick}
          onPhotoUpdate={(newPath) => handlePhotoUpdate(selected.id, newPath)}
        />
      )}

      {selectedApenado && (
        <ApenadoModal
          apenado={selectedApenado}
          onClose={() => setSelectedApenado(null)}
        />
      )}

      {loadingApenado && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 backdrop-blur-[2px]">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-xl flex items-center gap-3">
            <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
            <span className="text-sm font-medium text-gray-900 dark:text-white">Buscando ficha do apenado...</span>
          </div>
        </div>
      )}
    </div>
  )
}
