'use client'

import { useState, useEffect, useCallback } from 'react'
import { Brain, Users, Plus, Trash2, Shield, User, MapPin, Printer, AlertTriangle, Link2, PlusCircle, Loader2, ArrowRightLeft, FileText, Calendar, Search } from 'lucide-react'
import { toast } from 'sonner'
import { AIApenadoModal, AIPApenado } from './AIPanel'

interface AIPVinculo {
  id: string
  apenadoId: string
  vinculadoComId: string
  tipo: string
  forca: string
  notaVinculo: string | null
  documentadoEm: string
  documentadoPor: string
  outroApenado: AIPApenado
  direction: 'outgoing' | 'incoming'
}

const VINCULO_OPCOES = {
  "Família / Relacionamentos": [
    "Mãe",
    "Pai",
    "Filho(a)",
    "Cônjuge",
    "Companheiro(a)",
    "Ex-Cônjuge",
    "Irmão/Irmã",
    "Tio(a)",
    "Sobrinho(a)",
    "Primo(a)",
    "Avô/Avó",
    "Neto(a)",
    "Outro Familiar"
  ],
  "Crime / Facção / Alianças": [
    "Parceiro de Facção",
    "Liderança",
    "Subordinado",
    "Comparsa",
    "Apoio Logístico",
    "Apoio Financeiro",
    "Coautor de Crime"
  ],
  "Rivalidades / Conflitos": [
    "Rival de Facção",
    "Desafeto",
    "Inimigo Declarado"
  ],
  "Outros / Conexões": [
    "Amigo",
    "Conhecido",
    "Advogado",
    "Outro"
  ]
}

export function AIPVinculosPanel({
  preselectedSipeId,
  onClearPreselected
}: {
  preselectedSipeId?: number | null
  onClearPreselected?: () => void
}) {
  const [selectedSipeApenado, setSelectedSipeApenado] = useState<any | null>(null)
  const [apenadoAip, setApenadoAip] = useState<any | null>(null)
  const [vinculos, setVinculos] = useState<AIPVinculo[]>([])
  const [loading, setLoading] = useState(false)

  // Efeito para tratar a pré-seleção externa de um apenado
  useEffect(() => {
    if (preselectedSipeId) {
      const loadPreselected = async () => {
        try {
          const res = await fetch(`/api/sipe/apenados?sipeId=${preselectedSipeId}`)
          if (res.ok) {
            const data = await res.json()
            if (data.apenados && data.apenados.length > 0) {
              setSelectedSipeApenado(data.apenados[0])
            }
          }
        } catch (err) {
          console.error('Erro ao buscar apenado pré-selecionado:', err)
        } finally {
          if (onClearPreselected) {
            onClearPreselected()
          }
        }
      }
      loadPreselected()
    }
  }, [preselectedSipeId, onClearPreselected])

  // Modais e Detalhes
  const [modalApenado, setModalApenado] = useState<any | null>(null)
  const [layout, setLayout] = useState<any>(null)

  // Formulário de Novo Vínculo
  const [showAddForm, setShowAddForm] = useState(false)
  const [newLinkTargetId, setNewLinkTargetId] = useState('')
  const [newLinkTargetSipeId, setNewLinkTargetSipeId] = useState<number | null>(null)
  const [newLinkTipo, setNewLinkTipo] = useState('')
  const [newLinkForca, setNewLinkForca] = useState('confirmado')
  const [newLinkNota, setNewLinkNota] = useState('')
  const [savingLink, setSavingLink] = useState(false)

  // Busca de apenado base (barra lateral)
  const [searchBaseQuery, setSearchBaseQuery] = useState('')
  const [baseSearchResults, setBaseSearchResults] = useState<any[]>([])
  const [searchingBase, setSearchingBase] = useState(false)

  // Busca do apenado de destino (formulário)
  const [searchTargetQuery, setSearchTargetQuery] = useState('')
  const [targetSearchResults, setTargetSearchResults] = useState<any[]>([])
  const [searchingTarget, setSearchingTarget] = useState(false)
  const [targetSelected, setTargetSelected] = useState(false)

  // Debounce para busca do apenado base
  useEffect(() => {
    if (!searchBaseQuery.trim()) {
      setBaseSearchResults([])
      return
    }

    const delayDebounce = setTimeout(async () => {
      setSearchingBase(true)
      try {
        const res = await fetch(`/api/sipe/apenados?q=${encodeURIComponent(searchBaseQuery)}&limit=10`)
        if (res.ok) {
          const data = await res.json()
          setBaseSearchResults(data.apenados || [])
        }
      } catch (err) {
        console.error('Erro ao buscar apenado base:', err)
      } finally {
        setSearchingBase(false)
      }
    }, 400)

    return () => clearTimeout(delayDebounce)
  }, [searchBaseQuery])

  // Debounce para busca do apenado alvo
  useEffect(() => {
    if (!searchTargetQuery.trim() || targetSelected) {
      setTargetSearchResults([])
      return
    }

    const delayDebounce = setTimeout(async () => {
      setSearchingTarget(true)
      try {
        const res = await fetch(`/api/sipe/apenados?q=${encodeURIComponent(searchTargetQuery)}&limit=10`)
        if (res.ok) {
          const data = await res.json()
          setTargetSearchResults(data.apenados || [])
        }
      } catch (err) {
        console.error('Erro ao buscar apenado alvo:', err)
      } finally {
        setSearchingTarget(false)
      }
    }, 400)

    return () => clearTimeout(delayDebounce)
  }, [searchTargetQuery, targetSelected])

  // Carregar layout para o modal
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

  // Carregar vínculos do apenado selecionado
  const fetchVinculos = useCallback(async (sipeId: number) => {
    if (!sipeId) return
    setLoading(true)
    try {
      const res = await fetch(`/api/aip/vinculos?sipeId=${sipeId}`)
      if (res.ok) {
        const data = await res.json()
        setVinculos(data.vinculos || [])
        setApenadoAip(data.apenadoAip || null)
      }
    } catch (error) {
      console.error('Erro ao buscar vínculos:', error)
      toast.error('Erro ao carregar vínculos')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (selectedSipeApenado) {
      fetchVinculos(selectedSipeApenado.sipeId)
    } else {
      setVinculos([])
      setApenadoAip(null)
    }
  }, [selectedSipeApenado, fetchVinculos])

  // Abrir ficha completa de um apenado ao clicar
  const handleApenadoClick = async (id: string) => {
    const toastId = toast.loading('Carregando dados da ficha...')
    try {
      const res = await fetch(`/api/aip/apenados/${id}`)
      if (res.ok) {
        const data = await res.json()
        setModalApenado(data)
      } else {
        toast.error('Erro ao buscar dados do apenado')
      }
    } catch {
      toast.error('Erro ao conectar ao servidor')
    } finally {
      toast.dismiss(toastId)
    }
  }

  // Criar novo vínculo
  const handleCreateLink = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedSipeApenado || !newLinkTargetSipeId || !newLinkTipo) {
      toast.error('Preencha todos os campos obrigatórios')
      return
    }

    setSavingLink(true)
    try {
      const res = await fetch('/api/aip/vinculos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apenadoSipeId: selectedSipeApenado.sipeId,
          vinculadoComSipeId: newLinkTargetSipeId,
          tipo: newLinkTipo,
          forca: newLinkForca,
          notaVinculo: newLinkNota
        })
      })

      const data = await res.json()
      if (res.ok) {
        toast.success('Vínculo criado com sucesso!')
        setNewLinkTargetId('')
        setNewLinkTargetSipeId(null)
        setSearchTargetQuery('')
        setTargetSelected(false)
        setNewLinkNota('')
        setShowAddForm(false)
        fetchVinculos(selectedSipeApenado.sipeId)
      } else {
        toast.error(data.error || 'Erro ao criar vínculo')
      }
    } catch (error) {
      console.error(error)
      toast.error('Erro ao salvar vínculo')
    } finally {
      setSavingLink(false)
    }
  }

  // Deletar vínculo
  const handleDeleteLink = async (linkId: string) => {
    if (!confirm('Tem certeza que deseja remover este vínculo?')) return

    try {
      const res = await fetch(`/api/aip/vinculos/${linkId}`, {
        method: 'DELETE'
      })

      if (res.ok) {
        toast.success('Vínculo removido com sucesso!')
        if (selectedSipeApenado) {
          fetchVinculos(selectedSipeApenado.sipeId)
        }
      } else {
        const data = await res.json()
        toast.error(data.error || 'Erro ao remover vínculo')
      }
    } catch (error) {
      console.error(error)
      toast.error('Erro ao remover vínculo')
    }
  }

  // Objeto unificado contendo os dados do SIPE enriquecidos pela Inteligência do AIP
  const selectedApenado = selectedSipeApenado ? {
    ...selectedSipeApenado,
    ...(apenadoAip || {}),
    id: selectedSipeApenado.id, // Manter o ID do SIPE (UUID) para fins de fotos e endpoints do SIPE
    aipId: apenadoAip?.id || null // Armazenar o ID do AIP para referências do AIP
  } : null

  // Agrupamento de Vínculos para renderização
  const categorizarVinculo = (tipo: string) => {
    const t = tipo.toLowerCase()
    if (['mãe', 'pai', 'filho', 'filha', 'cônjuge', 'conjugue', 'esposa', 'esposo', 'irmão', 'irmã', 'familia', 'família', 'parente', 'companheiro', 'companheira', 'tio', 'tia', 'sobrinho', 'sobrinha', 'primo', 'prima', 'avô', 'avó', 'neto', 'neta'].some(word => t.includes(word))) {
      return 'familia'
    }
    if (['aliado', 'parceiro', 'facção', 'faccao', 'corre', 'membro', 'mesma faccao', 'mesma facção', 'liderança', 'lideranca', 'subordinado', 'comparsa', 'logístico', 'logistico', 'financeiro', 'coautor'].some(word => t.includes(word))) {
      return 'faccao'
    }
    if (['rival', 'inimigo', 'conflito', 'oposição', 'oposto', 'desafeto'].some(word => t.includes(word))) {
      return 'rival'
    }
    return 'outros'
  }

  const vinculosCategorizados = {
    familia: vinculos.filter(v => categorizarVinculo(v.tipo) === 'familia'),
    faccao: vinculos.filter(v => categorizarVinculo(v.tipo) === 'faccao'),
    rival: vinculos.filter(v => categorizarVinculo(v.tipo) === 'rival'),
    outros: vinculos.filter(v => categorizarVinculo(v.tipo) === 'outros'),
  }

  // Gerar e imprimir o Relatório
  const handlePrintReport = () => {
    if (!selectedApenado) return

    const dataFormatada = new Date().toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })

    const printWindow = window.open('', '_blank')
    if (!printWindow) {
      toast.error('Bloqueador de pop-ups impediu a abertura do relatório')
      return
    }

    const rowsHtml = vinculos.map(v => {
      const outro = v.outroApenado
      const forcaStr = v.forca === 'confirmado' ? 'Confirmado' : 'Suspeita'
      const forcaCor = v.forca === 'confirmado' ? '#16a34a' : '#d97706'
      
      return `
        <div class="relation-card">
          <div class="relation-photo-col">
            ${outro.photoPath ? `
              <img src="/api/aip/apenados/${outro.id}/foto" alt="${outro.nome}" class="relation-photo" />
            ` : `
              <div class="relation-photo-placeholder">${outro.nome.charAt(0)}</div>
            `}
          </div>
          <div class="relation-info-col">
            <h3 class="relation-name">${outro.nome}</h3>
            <p class="relation-meta">
              <strong>CPF:</strong> ${outro.cpf || '—'} | 
              <strong>Unidade:</strong> ${outro.unidade || '—'} | 
              <strong>Regime:</strong> ${outro.regime || '—'} | 
              <strong>Cela:</strong> ${outro.cela || '—'}
            </p>
            <p class="relation-meta">
              <strong>Facção Real:</strong> ${outro.facaoRealNome || '—'}
            </p>
            <div class="relation-type-tag" style="border-left: 3px solid ${forcaCor}">
              <strong>Vínculo:</strong> ${v.tipo} (${forcaStr})
            </div>
            ${v.notaVinculo ? `
              <div class="relation-note">
                <strong>Notas de Inteligência:</strong> ${v.notaVinculo}
              </div>
            ` : ''}
          </div>
          <div style="clear: both;"></div>
        </div>
      `
    }).join('')

    const docHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>Relatório de Inteligência - Vínculos de ${selectedApenado.nome}</title>
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
              color: #111827;
              margin: 40px;
              font-size: 12px;
              line-height: 1.5;
            }
            .header {
              border-bottom: 2px solid #6b21a8;
              padding-bottom: 15px;
              margin-bottom: 25px;
            }
            .header-title {
              font-size: 20px;
              font-weight: bold;
              margin: 0 0 5px 0;
              text-transform: uppercase;
              color: #581c87;
            }
            .header-meta {
              font-size: 11px;
              color: #4b5563;
              margin: 0;
            }
            .subject-section {
              background-color: #fcfbfe;
              border: 1px solid #e9d5ff;
              border-radius: 8px;
              padding: 15px;
              margin-bottom: 30px;
            }
            .subject-photo {
              width: 90px;
              height: 120px;
              object-cover: cover;
              border-radius: 6px;
              float: left;
              border: 1px solid #d8b4fe;
            }
            .subject-details {
              margin-left: 110px;
            }
            .subject-name {
              font-size: 16px;
              font-weight: bold;
              margin: 0 0 8px 0;
              color: #3b0764;
              text-transform: uppercase;
            }
            .grid-fields {
              display: grid;
              grid-template-columns: repeat(2, 1fr);
              gap: 8px;
            }
            .field-item {
              font-size: 11px;
            }
            .field-label {
              font-weight: bold;
              color: #6b7280;
            }
            .section-title {
              font-size: 14px;
              font-weight: bold;
              color: #581c87;
              border-bottom: 1px solid #e5e7eb;
              padding-bottom: 5px;
              margin: 25px 0 15px 0;
              text-transform: uppercase;
            }
            .relation-card {
              border: 1px solid #e5e7eb;
              border-radius: 6px;
              padding: 12px;
              margin-bottom: 15px;
              background-color: #ffffff;
              page-break-inside: avoid;
            }
            .relation-photo {
              width: 70px;
              height: 90px;
              object-fit: cover;
              border-radius: 4px;
              border: 1px solid #e5e7eb;
            }
            .relation-photo-placeholder {
              width: 70px;
              height: 90px;
              background-color: #e5e7eb;
              border-radius: 4px;
              display: flex;
              align-items: center;
              justify-content: center;
              font-weight: bold;
              font-size: 24px;
              color: #9ca3af;
            }
            .relation-photo-col {
              float: left;
              width: 70px;
            }
            .relation-info-col {
              margin-left: 85px;
            }
            .relation-name {
              font-size: 13px;
              font-weight: bold;
              margin: 0 0 5px 0;
              color: #111827;
              text-transform: uppercase;
            }
            .relation-meta {
              margin: 0 0 4px 0;
              font-size: 11px;
              color: #374151;
            }
            .relation-type-tag {
              background-color: #f9fafb;
              padding: 4px 8px;
              border-radius: 4px;
              display: inline-block;
              font-size: 10px;
              margin-bottom: 5px;
            }
            .relation-note {
              background-color: #f3f4f6;
              padding: 8px;
              border-radius: 4px;
              font-style: italic;
              margin-top: 5px;
              font-size: 11px;
            }
            .footer-signature {
              margin-top: 60px;
              border-top: 1px solid #9ca3af;
              padding-top: 10px;
              width: 250px;
              text-align: center;
              float: right;
              font-size: 11px;
            }
            @media print {
              body {
                margin: 20px;
              }
              .header {
                border-bottom-color: #000000;
              }
              .subject-section {
                border-color: #cccccc;
              }
              .relation-card {
                border-color: #cccccc;
              }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <h1 class="header-title">Dossiê de Inteligência - Vínculos Prisionais</h1>
            <p class="header-meta">
              <strong>Agência de Inteligência Penal (AIP)</strong> | 
              <strong>Gerado em:</strong> ${dataFormatada}
            </p>
          </div>

          <div class="subject-section">
            ${selectedApenado.photoPath ? `
              <img src="/api/sipe/apenados/${selectedApenado.id}/foto" alt="${selectedApenado.nome}" class="subject-photo" />
            ` : `
              <div style="width: 90px; height: 120px; background-color: #ddd; border-radius: 6px; float: left; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 30px; color: #777;">${selectedApenado.nome.charAt(0)}</div>
            `}
            <div class="subject-details">
              <h2 class="subject-name">${selectedApenado.nome}</h2>
              <div class="grid-fields">
                <div class="field-item"><span class="field-label">SIPE ID:</span> #${selectedApenado.sipeId}</div>
                <div class="field-item"><span class="field-label">CPF:</span> ${selectedApenado.cpf || '—'}</div>
                <div class="field-item"><span class="field-label">Unidade Atual:</span> ${selectedApenado.unidade || '—'}</div>
                <div class="field-item"><span class="field-label">Regime:</span> ${selectedApenado.regime || '—'}</div>
                <div class="field-item"><span class="field-label">Cela:</span> ${selectedApenado.cela || '—'}</div>
                <div class="field-item"><span class="field-label">Facção Real:</span> ${selectedApenado.facaoRealNome || selectedApenado.faccao || '—'}</div>
              </div>
              ${selectedApenado.observacoes ? `
                <div style="margin-top: 10px; font-size: 11px;">
                  <strong>Observações Adicionais:</strong> ${selectedApenado.observacoes}
                </div>
              ` : ''}
            </div>
            <div style="clear: both;"></div>
          </div>

          <h2 class="section-title">Vínculos e Relacionamentos Registrados (${vinculos.length})</h2>
          ${vinculos.length === 0 ? `
            <p style="font-style: italic; color: #6b7280; text-align: center; margin: 40px 0;">Nenhum vínculo documentado para este apenado.</p>
          ` : rowsHtml}

          <div class="footer-signature">
            <strong>Analista de Inteligência Penal</strong><br />
            Assinatura Digital / Identificação Funcional
          </div>
        </body>
      </html>
    `

    printWindow.document.write(docHtml)
    printWindow.document.close()
    printWindow.focus()
    setTimeout(() => {
      printWindow.print()
    }, 500)
  }


  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 min-h-0 flex-1">
      {/* Coluna Lateral Esquerda: Seleção do Apenado Base */}
      <div className="lg:col-span-1 bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4 flex flex-col gap-4 shadow-sm">
        <div>
          <h3 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2 mb-1">
            <Brain className="w-4 h-4 text-purple-500" />
            Selecionar Custodiado/Apenado
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400">Escolha um apenado do AIP para analisar ou documentar vínculos</p>
        </div>

        <div className="flex flex-col gap-2 relative">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar por nome, CPF..."
              value={searchBaseQuery}
              onChange={e => setSearchBaseQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none transition-all shadow-inner font-semibold"
            />
          </div>

          {/* Resultados da busca lateral */}
          {searchBaseQuery.trim() !== "" && (
            <div className="absolute top-full left-0 right-0 z-20 mt-1 max-h-60 overflow-y-auto bg-white dark:bg-gray-900 border border-gray-250 dark:border-gray-700 rounded-lg shadow-lg divide-y divide-gray-100 dark:divide-gray-800 animate-in fade-in slide-in-from-top-1 duration-200">
              {searchingBase ? (
                <div className="flex justify-center p-3 text-xs text-gray-400">
                  <Loader2 className="w-4 h-4 animate-spin mr-2" /> Buscando...
                </div>
              ) : baseSearchResults.length === 0 ? (
                <p className="p-3 text-xs text-gray-400 text-center">Nenhum apenado encontrado</p>
              ) : (
                baseSearchResults.map(a => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => {
                      setSelectedSipeApenado(a)
                      setSearchBaseQuery('')
                      setBaseSearchResults([])
                      setShowAddForm(false)
                    }}
                    className="w-full text-left p-2.5 text-xs hover:bg-purple-50 hover:text-purple-700 dark:hover:bg-purple-950/20 dark:hover:text-purple-400 flex items-center justify-between transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <span className="font-semibold block truncate uppercase">{a.nome}</span>
                      <span className="text-[10px] text-gray-450 block truncate">
                        {a.unidade || 'Sem Unidade'} {a.regime ? `• ${a.regime}` : ''}
                      </span>
                    </div>
                    {a.cpf && (
                      <span className="text-[10px] font-mono opacity-60 ml-2 shrink-0">{a.cpf}</span>
                    )}
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        {/* Card do Apenado Base Selecionado */}
        {selectedApenado && (
          <div className="bg-purple-50/40 dark:bg-purple-950/10 border border-purple-100 dark:border-purple-900/30 rounded-xl p-4 flex flex-col items-center text-center gap-3 mt-2 relative animate-in fade-in slide-in-from-bottom-2 duration-300">
            {/* Botão de limpar seleção no card */}
            <div className="absolute top-2 right-2">
              <button
                type="button"
                onClick={() => {
                  setSelectedSipeApenado(null)
                  setApenadoAip(null)
                  setVinculos([])
                  setShowAddForm(false)
                }}
                className="text-[10px] text-gray-400 hover:text-red-500 transition-colors font-bold uppercase"
                title="Limpar seleção"
              >
                Limpar
              </button>
            </div>

            <div className="w-20 h-20 rounded-2xl overflow-hidden bg-purple-500 flex items-center justify-center text-white font-bold text-3xl shadow-md border-2 border-purple-200 dark:border-purple-800">
              {selectedApenado.photoPath ? (
                <img
                  src={`/api/sipe/apenados/${selectedApenado.id}/foto`}
                  alt={selectedApenado.nome}
                  className="w-full h-full object-cover"
                />
              ) : (
                <span>{selectedApenado.nome.charAt(0).toUpperCase()}</span>
              )}
            </div>
            
            <div className="min-w-0 w-full">
              <h4 className="font-bold text-gray-900 dark:text-white text-sm line-clamp-2 uppercase leading-snug">{selectedApenado.nome}</h4>
              {(selectedApenado.vulgo || (selectedApenado.alcunhas && selectedApenado.alcunhas.length > 0)) && (
                <p className="text-xs text-purple-600 dark:text-purple-400 font-semibold mt-1">
                  Vulgo: {selectedApenado.vulgo || selectedApenado.alcunhas.map((a: any) => a.alcunha).join(', ')}
                </p>
              )}
              
              <div className="mt-3 space-y-1.5 text-left text-xs bg-white dark:bg-gray-900/50 p-3 rounded-lg border border-purple-100/40 dark:border-purple-950/20">
                <p className="text-gray-500"><span className="font-semibold text-gray-700 dark:text-gray-300">CPF:</span> {selectedApenado.cpf || '—'}</p>
                <p className="text-gray-500 truncate"><span className="font-semibold text-gray-700 dark:text-gray-300">Unidade:</span> {selectedApenado.unidade || '—'}</p>
                <p className="text-gray-500"><span className="font-semibold text-gray-700 dark:text-gray-300">Regime/Cela:</span> {selectedApenado.regime || '—'} / {selectedApenado.cela || '—'}</p>
                {selectedApenado.facaoRealNome && (
                  <p className="text-gray-550 flex items-center gap-1 font-bold text-purple-600 dark:text-purple-400">
                    <Shield className="w-3.5 h-3.5" /> {selectedApenado.facaoRealNome}
                  </p>
                )}
              </div>
            </div>

            {/* Ações Rápidas */}
            <div className="w-full grid grid-cols-2 gap-2 mt-2">
              <button
                type="button"
                onClick={() => {
                  const nextState = !showAddForm
                  setShowAddForm(nextState)
                  if (nextState) {
                    setNewLinkTargetId('')
                    setNewLinkTargetSipeId(null)
                    setSearchTargetQuery('')
                    setTargetSelected(false)
                    setTargetSearchResults([])
                  }
                }}
                className="flex items-center justify-center gap-1 px-3 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-semibold shadow-sm transition-all"
              >
                <PlusCircle className="w-3.5 h-3.5" />
                Vincular
              </button>
              <button
                type="button"
                onClick={handlePrintReport}
                className="flex items-center justify-center gap-1 px-3 py-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-650 rounded-xl text-xs font-semibold shadow-sm transition-all"
              >
                <Printer className="w-3.5 h-3.5" />
                Dossiê
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Colunas Principais: Árvore Visual de Relacionamentos */}
      <div className="lg:col-span-3 flex flex-col gap-6 min-h-0">
        {!selectedSipeApenado ? (
          <div className="flex-1 bg-white dark:bg-gray-800 rounded-2xl border border-gray-250 dark:border-gray-700 flex flex-col items-center justify-center text-center p-8 gap-4 shadow-sm select-none">
            <div className="w-16 h-16 rounded-full bg-purple-50 dark:bg-purple-950/20 flex items-center justify-center text-purple-500">
              <Users className="w-8 h-8" />
            </div>
            <div>
              <h3 className="font-bold text-gray-900 dark:text-white text-base">Dashboard de Vínculos da Agência</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 max-w-sm mt-1">Selecione um apenado no menu lateral para visualizar, imprimir relatórios ou cadastrar novos relacionamentos.</p>
            </div>
          </div>
        ) : loading ? (
          <div className="flex-1 bg-white dark:bg-gray-800 rounded-2xl border border-gray-250 dark:border-gray-700 flex items-center justify-center text-gray-400 shadow-sm">
            <Loader2 className="w-6 h-6 animate-spin mr-2 text-purple-500" /> Carregando mapa de relacionamentos...
          </div>
        ) : (
          <div className="flex-1 flex flex-col gap-4 min-h-0">
            {/* Header do Painel */}
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-4 flex items-center justify-between shadow-sm shrink-0">
              <div>
                <h3 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-1.5">
                  <ArrowRightLeft className="w-4 h-4 text-purple-500" />
                  Rede de Vínculos de {selectedApenado?.nome}
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{vinculos.length} ligação(ões) prisionais ou familiares confirmadas/suspeitas</p>
              </div>

              {/* Botão de Add no topo do painel caso queira */}
              {!showAddForm && (
                <button
                  type="button"
                  onClick={() => {
                    setShowAddForm(true)
                    setNewLinkTargetId('')
                    setNewLinkTargetSipeId(null)
                    setSearchTargetQuery('')
                    setTargetSelected(false)
                    setTargetSearchResults([])
                  }}
                  className="px-3 py-1.5 bg-purple-50 hover:bg-purple-100 dark:bg-purple-950/20 dark:hover:bg-purple-900/30 text-purple-700 dark:text-purple-300 text-xs font-bold rounded-lg border border-purple-200 dark:border-purple-900/50 transition-colors shadow-sm flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Novo Vínculo
                </button>
              )}
            </div>

            {/* Painel de Formulário Rápido de Novo Vínculo (Condicional) */}
            {showAddForm && (
              <form onSubmit={handleCreateLink} className="bg-white dark:bg-gray-800 border border-purple-200 dark:border-purple-900/40 rounded-2xl p-5 shadow-md flex flex-col gap-4 animate-in slide-in-from-top-3 duration-300 shrink-0">
                <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-750 pb-2">
                  <h4 className="font-bold text-purple-700 dark:text-purple-400 text-sm flex items-center gap-1.5">
                    <Link2 className="w-4 h-4" />
                    Registrar Novo Relacionamento
                  </h4>
                  <button
                    type="button"
                    onClick={() => setShowAddForm(false)}
                    className="text-xs text-gray-400 hover:text-red-500 font-semibold"
                  >
                    Fechar
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Busca do Apenado Destino */}
                  <div className="md:col-span-1 flex flex-col gap-1.5 relative">
                    <label className="text-xs font-semibold text-gray-700 dark:text-gray-300">Vincular com (Apenado):</label>
                    <div className="relative">
                      <input
                        type="text"
                        placeholder="Buscar por nome ou CPF..."
                        value={searchTargetQuery}
                        onChange={e => {
                          setSearchTargetQuery(e.target.value)
                          setTargetSelected(false)
                          setNewLinkTargetSipeId(null)
                          setNewLinkTargetId('')
                        }}
                        className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white"
                      />
                    </div>
                    
                    {/* Lista rápida de resultados da busca */}
                    {searchTargetQuery.trim() !== "" && !targetSelected && (
                      <div className="absolute top-full left-0 right-0 z-20 mt-1 bg-white dark:bg-gray-900 border border-gray-250 dark:border-gray-700 rounded-lg max-h-32 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-800 shadow-md">
                        {searchingTarget ? (
                          <div className="flex justify-center p-2 text-xs text-gray-400">
                            <Loader2 className="w-4 h-4 animate-spin mr-1" /> Buscando...
                          </div>
                        ) : targetSearchResults.length === 0 ? (
                          <p className="p-2 text-xs text-gray-400 text-center">Nenhum apenado encontrado</p>
                        ) : (
                          targetSearchResults
                            .filter(a => {
                              if (selectedSipeApenado && a.sipeId === selectedSipeApenado.sipeId) return false
                              return true
                            })
                            .map(a => (
                              <button
                                key={a.id}
                                type="button"
                                onClick={() => {
                                  setNewLinkTargetId(a.id)
                                  setNewLinkTargetSipeId(a.sipeId)
                                  setSearchTargetQuery(a.nome)
                                  setTargetSelected(true)
                                  setTargetSearchResults([])
                                }}
                                className={`w-full text-left p-2 text-xs hover:bg-purple-50 hover:text-purple-700 dark:hover:bg-purple-950/20 dark:hover:text-purple-400 flex items-center justify-between ${
                                  newLinkTargetSipeId === a.sipeId ? 'bg-purple-50 text-purple-700 dark:bg-purple-950/30 dark:text-purple-400 font-bold' : ''
                                }`}
                              >
                                <span className="truncate">{a.nome}</span>
                                {a.cpf && <span className="text-[10px] opacity-60 shrink-0 ml-1">{a.cpf}</span>}
                              </button>
                            ))
                        )}
                      </div>
                    )}
                    
                    {newLinkTargetSipeId && targetSelected && (
                      <p className="text-[11px] text-green-600 dark:text-green-400 font-semibold mt-1 flex items-center gap-1 animate-in fade-in duration-200">
                        <span>✓</span> Apenado selecionado com sucesso!
                      </p>
                    )}
                  </div>

                  {/* Tipo de Relação e Força */}
                  <div className="md:col-span-1 flex flex-col gap-4">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-semibold text-gray-700 dark:text-gray-300">Grau de Parentesco / Vínculo:</label>
                      <select
                        value={newLinkTipo}
                        onChange={e => setNewLinkTipo(e.target.value)}
                        required
                        className="px-3 py-2 text-sm bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white font-medium"
                      >
                        <option value="">Selecione o vínculo...</option>
                        {Object.entries(VINCULO_OPCOES).map(([grupo, opcoes]) => (
                          <optgroup key={grupo} label={grupo} className="font-bold text-purple-700 dark:text-purple-400 bg-white dark:bg-gray-900">
                            {opcoes.map(opcao => (
                              <option key={opcao} value={opcao} className="font-normal text-gray-900 dark:text-white bg-white dark:bg-gray-900">
                                {opcao}
                              </option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-semibold text-gray-700 dark:text-gray-300">Nível de Confiança:</label>
                      <select
                        value={newLinkForca}
                        onChange={e => setNewLinkForca(e.target.value)}
                        className="px-3 py-2 text-sm bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white"
                      >
                        <option value="confirmado">Confirmado (Verificado)</option>
                        <option value="suspeita">Suspeita (Em Investigação)</option>
                      </select>
                    </div>
                  </div>

                  {/* Notas */}
                  <div className="md:col-span-1 flex flex-col gap-1.5">
                    <label className="text-xs font-semibold text-gray-700 dark:text-gray-300">Notas Adicionais / Justificativa:</label>
                    <textarea
                      placeholder="Detalhes que comprovam ou justificam esse vínculo..."
                      value={newLinkNota}
                      onChange={e => setNewLinkNota(e.target.value)}
                      rows={4}
                      className="px-3 py-2 text-sm bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white resize-none"
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-2 border-t border-gray-150 dark:border-gray-750 pt-3">
                  <button
                    type="button"
                    onClick={() => {
                      setNewLinkTargetId('')
                      setNewLinkTargetSipeId(null)
                      setSearchTargetQuery('')
                      setTargetSelected(false)
                      setTargetSearchResults([])
                      setNewLinkNota('')
                      setShowAddForm(false)
                    }}
                    className="px-4 py-2 text-xs font-semibold text-gray-600 dark:text-gray-400 bg-gray-50 hover:bg-gray-100 dark:bg-gray-800 dark:hover:bg-gray-700 rounded-lg transition-colors border border-gray-200 dark:border-gray-650"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={savingLink || !newLinkTargetSipeId}
                    className="px-4 py-2 text-xs font-semibold text-white bg-purple-600 hover:bg-purple-700 rounded-lg transition-all shadow-sm flex items-center gap-1.5 disabled:opacity-50"
                  >
                    {savingLink ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Link2 className="w-3.5 h-3.5" />
                    )}
                    Salvar Vínculo
                  </button>
                </div>
              </form>
            )}

            {/* Grid de Vínculos por Categoria */}
            <div className="flex-1 overflow-y-auto space-y-6">
              {vinculos.length === 0 ? (
                <div className="h-60 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl flex flex-col items-center justify-center p-8 text-center text-gray-400 gap-2 shadow-sm animate-fade-in">
                  <Users className="w-10 h-10 opacity-30 text-purple-500" />
                  <p className="text-sm font-semibold">Nenhum vínculo documentado</p>
                  <p className="text-xs max-w-xs">Este apenado não possui nenhuma ligação de parentesco, facção ou rivalidades registradas no sistema.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-6">
                  {/* Categoria 1: Família */}
                  {vinculosCategorizados.familia.length > 0 && (
                    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-4 shadow-sm flex flex-col gap-3">
                      <h4 className="font-bold text-sm text-gray-900 dark:text-white flex items-center gap-1.5 border-b border-gray-100 dark:border-gray-750 pb-2">
                        <span className="w-2 h-2 rounded-full bg-emerald-500" />
                        🟢 Família e Relacionamentos ({vinculosCategorizados.familia.length})
                      </h4>
                      <div className="space-y-3">
                        {vinculosCategorizados.familia.map(v => (
                          <RelationCard key={v.id} link={v} onDelete={handleDeleteLink} onClick={handleApenadoClick} />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Categoria 2: Facção / Alianças */}
                  {vinculosCategorizados.faccao.length > 0 && (
                    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-4 shadow-sm flex flex-col gap-3">
                      <h4 className="font-bold text-sm text-gray-900 dark:text-white flex items-center gap-1.5 border-b border-gray-100 dark:border-gray-750 pb-2">
                        <span className="w-2 h-2 rounded-full bg-amber-500" />
                        🟡 Alianças e Facção ({vinculosCategorizados.faccao.length})
                      </h4>
                      <div className="space-y-3">
                        {vinculosCategorizados.faccao.map(v => (
                          <RelationCard key={v.id} link={v} onDelete={handleDeleteLink} onClick={handleApenadoClick} />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Categoria 3: Rivalidades */}
                  {vinculosCategorizados.rival.length > 0 && (
                    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-4 shadow-sm flex flex-col gap-3">
                      <h4 className="font-bold text-sm text-gray-900 dark:text-white flex items-center gap-1.5 border-b border-gray-100 dark:border-gray-750 pb-2">
                        <span className="w-2 h-2 rounded-full bg-red-500" />
                        🔴 Conflitos e Rivalidades ({vinculosCategorizados.rival.length})
                      </h4>
                      <div className="space-y-3">
                        {vinculosCategorizados.rival.map(v => (
                          <RelationCard key={v.id} link={v} onDelete={handleDeleteLink} onClick={handleApenadoClick} />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Categoria 4: Outros */}
                  {vinculosCategorizados.outros.length > 0 && (
                    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-4 shadow-sm flex flex-col gap-3">
                      <h4 className="font-bold text-sm text-gray-900 dark:text-white flex items-center gap-1.5 border-b border-gray-100 dark:border-gray-750 pb-2">
                        <span className="w-2 h-2 rounded-full bg-blue-500" />
                        🔵 Outras Conexões ({vinculosCategorizados.outros.length})
                      </h4>
                      <div className="space-y-3">
                        {vinculosCategorizados.outros.map(v => (
                          <RelationCard key={v.id} link={v} onDelete={handleDeleteLink} onClick={handleApenadoClick} />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Modal Reutilizável de Detalhes de Apenado do AIP */}
      {modalApenado && (
        <AIApenadoModal
          apenado={modalApenado}
          layout={layout}
          onClose={() => setModalApenado(null)}
          onUpdate={(updated) => {
            // Atualizar o apenado no state se ele for o base
            if (selectedSipeApenado && updated.sipeId === selectedSipeApenado.sipeId) {
              setApenadoAip(updated)
            }
            // Recarregar os vínculos de qualquer forma
            if (selectedSipeApenado) {
              fetchVinculos(selectedSipeApenado.sipeId)
            }
            setModalApenado(updated)
          }}
        />
      )}
    </div>
  )
}

interface RelationCardProps {
  link: AIPVinculo
  onDelete: (id: string) => void
  onClick: (id: string) => void
}

function RelationCard({ link, onDelete, onClick }: RelationCardProps) {
  const outro = link.outroApenado
  if (!outro) return null

  const isConfirmado = link.forca === 'confirmado'

  return (
    <div className="flex items-start gap-3 bg-gray-50 hover:bg-purple-50/20 dark:bg-gray-900/40 dark:hover:bg-purple-950/10 border border-gray-200/60 dark:border-gray-700/60 rounded-xl p-3.5 relative group transition-all duration-200">
      {/* Botão de Excluir Vínculo no Hover */}
      <button
        onClick={() => onDelete(link.id)}
        className="absolute top-3 right-3 p-1.5 bg-red-50 hover:bg-red-150 dark:bg-red-950/30 text-red-500 dark:text-red-400 hover:text-red-650 dark:hover:text-red-300 rounded-lg transition-all opacity-0 group-hover:opacity-100 focus:opacity-100"
        title="Remover este vínculo"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>

      {/* Foto Clicável do Apenado Vinculado */}
      <button
        type="button"
        onClick={() => onClick(outro.id)}
        className="w-12 h-16 rounded-lg overflow-hidden bg-gray-200 dark:bg-gray-800 flex-shrink-0 flex items-center justify-center text-gray-400 select-none border border-gray-300 dark:border-gray-700 shadow-sm cursor-pointer hover:opacity-90 active:scale-95 transition-all"
        title="Ver ficha completa"
      >
        {outro.photoPath ? (
          <img
            src={`/api/aip/apenados/${outro.id}/foto`}
            alt={outro.nome}
            className="w-full h-full object-cover"
          />
        ) : (
          <User className="w-6 h-6" />
        )}
      </button>

      <div className="flex-1 min-w-0 pr-6">
        <button
          onClick={() => onClick(outro.id)}
          className="text-xs font-bold text-gray-900 dark:text-white hover:text-purple-600 dark:hover:text-purple-400 text-left hover:underline truncate block uppercase"
        >
          {outro.nome}
        </button>
        
        <p className="text-[10px] text-gray-500 mt-0.5 truncate font-medium">
          {outro.unidade || '—'} {outro.regime && `• ${outro.regime}`}
        </p>

        {/* Badge Vínculo */}
        <div className="flex items-center gap-1.5 mt-2">
          <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-purple-700 dark:text-purple-400 flex items-center gap-1">
            <Link2 className="w-2.5 h-2.5" />
            {link.tipo}
          </span>
          <span className={`px-1.5 py-0.5 rounded-md text-[9px] font-bold uppercase ${
            isConfirmado 
              ? 'bg-green-50 dark:bg-green-950/20 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-900/50' 
              : 'bg-amber-50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-900/50'
          }`}>
            {isConfirmado ? 'Confirmado' : 'Suspeita'}
          </span>
        </div>

        {/* Justificativa/Nota */}
        {link.notaVinculo && (
          <p className="text-[10px] text-gray-650 dark:text-gray-400 mt-2 bg-white dark:bg-gray-800/40 p-2 rounded-lg border border-gray-150 dark:border-gray-850 line-clamp-2 italic leading-relaxed">
            "{link.notaVinculo}"
          </p>
        )}
      </div>
    </div>
  )
}
