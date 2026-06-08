'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  Smartphone, Search, Plus, Upload, Filter, Loader2, X, 
  Calendar, MapPin, Building2, User, FileText, CheckCircle, 
  AlertTriangle, ChevronLeft, ChevronRight, BarChart2, ShieldAlert, Cpu, Radio
} from 'lucide-react'

interface Aparelho {
  id: string
  timestamp: string
  responsavel: string
  dataArrecadacao: string | null
  dataRecebimento: string | null
  municipio: string
  unidadePrisional: string
  celaPavilhao: string | null
  unidadeExterna: string | null
  localExterno: string | null
  processoSei: string | null
  marca: string | null
  smartwatch: string | null
  chip: string | null
}

interface Pagination {
  total: number
  page: number
  limit: number
  totalPages: number
}

interface StatItem {
  name: string
  count: number
}

interface Stats {
  marcas: StatItem[]
  unidades: StatItem[]
}

export function AparelhosClient() {
  // Estados principais
  const [aparelhos, setAparelhos] = useState<Aparelho[]>([])
  const [pagination, setPagination] = useState<Pagination>({ total: 0, page: 1, limit: 15, totalPages: 1 })
  const [stats, setStats] = useState<Stats>({ marcas: [], unidades: [] })
  const [loading, setLoading] = useState(true)

  // Filtros
  const [search, setSearch] = useState('')
  const [unidade, setUnidade] = useState('')
  const [municipio, setMunicipio] = useState('')
  const [marca, setMarca] = useState('')
  const [dataInicio, setDataInicio] = useState('')
  const [dataFim, setDataFim] = useState('')
  
  // Listas de opções exclusivas para filtros
  const [opcoesUnidades, setOpcoesUnidades] = useState<string[]>([])
  const [opcoesMunicipios, setOpcoesMunicipios] = useState<string[]>([])
  const [opcoesMarcas, setOpcoesMarcas] = useState<string[]>([])

  // Modais
  const [modalImportOpen, setModalImportOpen] = useState(false)
  const [modalCadOpen, setModalCadOpen] = useState(false)

  // Estado do Upload
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [overwrite, setOverwrite] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null)

  // Estado do Cadastro Manual
  const [cadForm, setCadForm] = useState({
    responsavel: '',
    municipio: '',
    unidadePrisional: '',
    celaPavilhao: '',
    unidadeExterna: '',
    localExterno: '',
    processoSei: '',
    marca: '',
    smartwatch: '',
    chip: '',
    dataArrecadacao: '',
    dataRecebimento: '',
  })
  const [cadSaving, setCadSaving] = useState(false)
  const [cadError, setCadError] = useState<string | null>(null)
  const [cadSuccess, setCadSuccess] = useState(false)

  // Carregar dados da API
  const fetchAparelhos = useCallback(async (pageTarget = 1) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        page: pageTarget.toString(),
        limit: pagination.limit.toString(),
        search,
        unidade,
        municipio,
        marca,
        dataInicio,
        dataFim,
      })

      const res = await fetch(`/api/aparelhos?${params.toString()}`)
      if (!res.ok) throw new Error('Erro ao buscar dados')
      
      const json = await res.json()
      setAparelhos(json.data)
      setPagination(json.pagination)
      setStats(json.stats)

      // Extrai opções para filtros dinâmicos na primeira carga
      if (opcoesUnidades.length === 0 && json.data.length > 0) {
        // Buscamos estatísticas mais completas se possível, ou construímos com base no histórico
        // Por simplicidade, preenchemos selects fixos baseados em dados reais comumente encontrados ou dinâmicos
        const mockUnidades = [
          'PENITENCIÁRIA ESTADUAL ARUANA',
          'PENITENCIÁRIA DE MÉDIO PORTE - (ANTIGO ÊNIO)',
          'COLÔNIA AGRÍCOLA PENAL ÊNIO DOS SANTOS PINHEIRO - (CAPEP)',
          'CENTRO DE DETENÇÃO PROVISÓRIO DE PORTO VELHO (ANTIGO URSO)',
          'PENITENCIÁRIA ESTADUAL EDIVAN MARIANO ROSENDO - (PANDA)',
          'PENITENCIÁRIA ESTADUAL JORGE THIAGO AGUIAR AFONSO',
          'CENTRO DE RESSOCIALIZAÇÃO VALE DO GUAPORTE (CRVG)',
          'PRESÍDIO SEMIABERTO DE JI-PARANÁ',
          'PENITENCIÁRIA REGIONAL DR. AGENOR MARTINS DE CARVALHO',
          'CASA DE DETENÇÃO DE JI-PARANÁ',
          'CASA DE DETENÇÃO DE CACOAL',
          'CASA DE DETENÇÃO DE GUAJARÁ MIRIM'
        ]
        const mockMunicipios = ['PORTO VELHO', 'JI-PARANÁ', 'CACOAL', 'GUAJARÁ MIRIM']
        const mockMarcas = ['Samsung', 'Motorola', 'Xiaomi', 'Redmi', 'LG', 'Positivo', 'Realme', 'Outros']
        
        setOpcoesUnidades(mockUnidades)
        setOpcoesMunicipios(mockMunicipios)
        setOpcoesMarcas(mockMarcas)
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [search, unidade, municipio, marca, dataInicio, dataFim, pagination.limit, opcoesUnidades.length])

  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      fetchAparelhos(1)
    }, 400)

    return () => clearTimeout(delayDebounceFn)
  }, [search, unidade, municipio, marca, dataInicio, dataFim, fetchAparelhos])

  // Limpar Filtros
  const handleClearFilters = () => {
    setSearch('')
    setUnidade('')
    setMunicipio('')
    setMarca('')
    setDataInicio('')
    setDataFim('')
    fetchAparelhos(1)
  }

  // Ações de Upload de CSV
  const handleImportSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!uploadFile) return

    setUploading(true)
    setUploadError(null)
    setUploadSuccess(null)
    setUploadProgress(10)

    try {
      const formData = new FormData()
      formData.append('file', uploadFile)
      formData.append('overwrite', overwrite.toString())

      // Simulação visual de progresso enquanto a requisição roda
      const interval = setInterval(() => {
        setUploadProgress(prev => (prev < 90 ? prev + 10 : prev))
      }, 500)

      const res = await fetch('/api/aparelhos/import', {
        method: 'POST',
        body: formData,
      })

      clearInterval(interval)
      setUploadProgress(100)

      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Erro na importação')

      setUploadSuccess(json.message || 'Importação realizada com sucesso!')
      fetchAparelhos(1)
      
      // Limpa após 2 segundos
      setTimeout(() => {
        setModalImportOpen(false)
        setUploadFile(null)
        setUploadSuccess(null)
        setUploadProgress(0)
      }, 2000)
    } catch (err: any) {
      setUploadError(err.message || 'Erro ao importar arquivo.')
      setUploadProgress(0)
    } finally {
      setUploading(false)
    }
  }

  // Ações de Cadastro Manual
  const handleCadSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setCadSaving(true)
    setCadError(null)
    setCadSuccess(false)

    try {
      const res = await fetch('/api/aparelhos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cadForm),
      })

      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Erro ao salvar dispositivo')

      setCadSuccess(true)
      fetchAparelhos(1)

      // Limpar formulário
      setCadForm({
        responsavel: '',
        municipio: '',
        unidadePrisional: '',
        celaPavilhao: '',
        unidadeExterna: '',
        localExterno: '',
        processoSei: '',
        marca: '',
        smartwatch: '',
        chip: '',
        dataArrecadacao: '',
        dataRecebimento: '',
      })

      setTimeout(() => {
        setModalCadOpen(false)
        setCadSuccess(false)
      }, 1500)
    } catch (err: any) {
      setCadError(err.message || 'Erro ao salvar.')
    } finally {
      setCadSaving(false)
    }
  }

  // Formatar datas locais para o usuário
  const formatDate = (dateString: string | null) => {
    if (!dateString) return '—'
    const date = new Date(dateString)
    if (isNaN(date.getTime())) return '—'
    return date.toLocaleDateString('pt-BR', { timeZone: 'UTC' })
  }

  return (
    <div className="flex flex-col h-full min-h-0 bg-gray-50 dark:bg-gray-950 text-gray-800 dark:text-gray-200">
      
      {/* Header */}
      <div className="px-6 py-5 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shrink-0">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="p-3 bg-sigma-600/10 border border-sigma-500/20 text-sigma-600 dark:text-sigma-400 rounded-2xl shadow-sm">
              <Smartphone className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <h1 className="text-xl md:text-2xl font-black tracking-tight text-gray-900 dark:text-white">
                Controle de Celulares Recebidos
              </h1>
              <p className="text-xs md:text-sm text-gray-500 dark:text-gray-400 font-medium">
                Gestão e análise de aparelhos celulares e dispositivos apreendidos no prisional pela GIP.
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <button
              onClick={() => setModalImportOpen(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-gray-800 hover:bg-gray-700 active:scale-95 text-white dark:bg-gray-700 dark:hover:bg-gray-600 rounded-xl text-xs font-bold transition-all shadow-sm border border-gray-700/30"
            >
              <Upload className="w-4 h-4" />
              Importar Planilha CSV
            </button>
            <button
              onClick={() => setModalCadOpen(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-sigma-600 hover:bg-sigma-550 active:scale-95 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-sigma-600/15"
            >
              <Plus className="w-4 h-4" />
              Novo Cadastro
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        
        {/* Painel de Estatísticas com Visual Rico */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          
          {/* Card 1: Total */}
          <div className="relative overflow-hidden p-5 bg-gradient-to-br from-sigma-600/10 via-transparent to-transparent border border-sigma-500/10 dark:bg-gray-900 rounded-2xl shadow-sm flex items-center justify-between">
            <div>
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider block mb-1">
                Total de Aparelhos
              </span>
              {loading ? (
                <Loader2 className="w-8 h-8 animate-spin text-sigma-500" />
              ) : (
                <span className="text-3xl font-black tracking-tight text-sigma-600 dark:text-sigma-400">
                  {pagination.total}
                </span>
              )}
              <span className="text-[10px] text-gray-400 block mt-1">Registros consolidados no sistema</span>
            </div>
            <div className="p-3 bg-sigma-600/15 text-sigma-600 dark:text-sigma-400 rounded-xl">
              <Smartphone className="w-8 h-8" />
            </div>
          </div>

          {/* Card 2: Marcas Mais Comuns */}
          <div className="p-5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl shadow-sm">
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider block mb-3 flex items-center gap-2">
              <Cpu className="w-3.5 h-3.5" /> Marcas Mais Comuns
            </span>
            <div className="space-y-2">
              {loading ? (
                <div className="flex justify-center py-2"><Loader2 className="w-5 h-5 animate-spin text-gray-400" /></div>
              ) : stats.marcas.length > 0 ? (
                stats.marcas.slice(0, 3).map((item, idx) => {
                  const percentage = pagination.total > 0 ? Math.round((item.count / pagination.total) * 100) : 0
                  return (
                    <div key={item.name} className="flex flex-col gap-1">
                      <div className="flex justify-between text-xs font-semibold">
                        <span className="text-gray-700 dark:text-gray-300">{item.name || 'Outras/NI'}</span>
                        <span className="text-gray-400">{item.count} ({percentage}%)</span>
                      </div>
                      <div className="w-full bg-gray-100 dark:bg-gray-800 h-1.5 rounded-full overflow-hidden">
                        <div 
                          className="bg-sigma-500 h-full rounded-full" 
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                    </div>
                  )
                })
              ) : (
                <div className="text-xs text-gray-400 text-center py-2">Sem estatísticas disponíveis</div>
              )}
            </div>
          </div>

          {/* Card 3: Ranking de Apreensões */}
          <div className="p-5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl shadow-sm">
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider block mb-3 flex items-center gap-2">
              <Building2 className="w-3.5 h-3.5" /> Principais Prisões
            </span>
            <div className="space-y-2">
              {loading ? (
                <div className="flex justify-center py-2"><Loader2 className="w-5 h-5 animate-spin text-gray-400" /></div>
              ) : stats.unidades.length > 0 ? (
                stats.unidades.slice(0, 3).map((item, idx) => {
                  const percentage = pagination.total > 0 ? Math.round((item.count / pagination.total) * 100) : 0
                  return (
                    <div key={item.name} className="flex flex-col gap-1">
                      <div className="flex justify-between text-xs font-semibold">
                        <span className="text-gray-700 dark:text-gray-300 truncate max-w-[200px]" title={item.name}>
                          {item.name}
                        </span>
                        <span className="text-gray-400 flex-shrink-0">{item.count}</span>
                      </div>
                      <div className="w-full bg-gray-100 dark:bg-gray-800 h-1.5 rounded-full overflow-hidden">
                        <div 
                          className="bg-red-500 h-full rounded-full" 
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                    </div>
                  )
                })
              ) : (
                <div className="text-xs text-gray-400 text-center py-2">Sem estatísticas disponíveis</div>
              )}
            </div>
          </div>
        </div>

        {/* Barra de Filtros Avançados */}
        <div className="p-4 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl shadow-sm space-y-4">
          <div className="flex items-center gap-2 border-b border-gray-100 dark:border-gray-800 pb-2">
            <Filter className="w-4 h-4 text-sigma-500" />
            <span className="text-xs font-bold uppercase tracking-wider text-gray-900 dark:text-white">Filtros de Busca</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            
            {/* Busca Geral */}
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3.5 top-3.5 text-gray-400" />
              <input
                type="text"
                placeholder="Busca (marca, sei, celas, responsavel)..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-xs focus:ring-2 focus:ring-sigma-500 focus:outline-none placeholder-gray-400 text-gray-800 dark:text-gray-100"
              />
            </div>

            {/* Select Unidade Prisional */}
            <select
              value={unidade}
              onChange={e => setUnidade(e.target.value)}
              className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-xs focus:ring-2 focus:ring-sigma-500 focus:outline-none text-gray-700 dark:text-gray-200"
            >
              <option value="">Todas as Unidades</option>
              {opcoesUnidades.map(u => (
                <option key={u} value={u}>{u}</option>
              ))}
            </select>

            {/* Select Marca */}
            <select
              value={marca}
              onChange={e => setMarca(e.target.value)}
              className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-xs focus:ring-2 focus:ring-sigma-500 focus:outline-none text-gray-700 dark:text-gray-200"
            >
              <option value="">Todas as Marcas</option>
              {opcoesMarcas.map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>

            {/* Select Município */}
            <select
              value={municipio}
              onChange={e => setMunicipio(e.target.value)}
              className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-xs focus:ring-2 focus:ring-sigma-500 focus:outline-none text-gray-700 dark:text-gray-200"
            >
              <option value="">Todos os Municípios</option>
              {opcoesMunicipios.map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>

          </div>

          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pt-2">
            
            {/* Datas */}
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-gray-400 uppercase shrink-0">Período Apreensão:</span>
              <input
                type="date"
                value={dataInicio}
                onChange={e => setDataInicio(e.target.value)}
                className="px-2 py-1.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-xs focus:ring-2 focus:ring-sigma-500 focus:outline-none text-gray-700 dark:text-gray-200"
              />
              <span className="text-gray-400 text-xs">até</span>
              <input
                type="date"
                value={dataFim}
                onChange={e => setDataFim(e.target.value)}
                className="px-2 py-1.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-xs focus:ring-2 focus:ring-sigma-500 focus:outline-none text-gray-700 dark:text-gray-200"
              />
            </div>

            {/* Limpar */}
            <button
              onClick={handleClearFilters}
              className="px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 rounded-xl text-xs font-semibold transition-all"
            >
              Limpar Filtros
            </button>
          </div>
        </div>

        {/* Tabela de Resultados */}
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl shadow-sm overflow-hidden flex flex-col min-h-[400px]">
          
          {loading ? (
            <div className="flex-1 flex flex-col items-center justify-center py-20 gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-sigma-500" />
              <span className="text-xs text-gray-400 font-bold">Carregando dispositivos...</span>
            </div>
          ) : aparelhos.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center py-20 gap-3 text-center">
              <Smartphone className="w-12 h-12 text-gray-300 dark:text-gray-700" />
              <div>
                <p className="font-bold text-gray-700 dark:text-gray-300 text-sm">Nenhum aparelho encontrado</p>
                <p className="text-xs text-gray-400 mt-0.5">Tente ajustar seus filtros ou faça uma importação.</p>
              </div>
            </div>
          ) : (
            <>
              {/* Tabela Responsiva */}
              <div className="flex-1 overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-gray-50/70 dark:bg-gray-850/50 border-b border-gray-100 dark:border-gray-800 text-gray-400 font-bold uppercase tracking-wider">
                      <th className="py-3 px-4">Marca</th>
                      <th className="py-3 px-4">Unidade Prisional</th>
                      <th className="py-3 px-4">Cela/Local</th>
                      <th className="py-3 px-4">Processo SEI</th>
                      <th className="py-3 px-4">Data Apreensão</th>
                      <th className="py-3 px-4">Chip/Operadora</th>
                      <th className="py-3 px-4">Responsável</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {aparelhos.map(item => (
                      <tr 
                        key={item.id} 
                        className="hover:bg-gray-50/50 dark:hover:bg-gray-850/30 transition-colors"
                      >
                        <td className="py-3 px-4 font-bold text-gray-900 dark:text-white flex items-center gap-2">
                          <Smartphone className="w-3.5 h-3.5 text-gray-400" />
                          {item.marca || 'Celular Genérico'}
                          {item.smartwatch && (
                            <span className="px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded text-[9px] font-black uppercase">
                              + Relógio
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-gray-700 dark:text-gray-300 font-medium truncate max-w-[220px]" title={item.unidadePrisional}>
                          {item.unidadePrisional}
                        </td>
                        <td className="py-3 px-4 text-gray-600 dark:text-gray-400">
                          {item.celaPavilhao || item.unidadeExterna || item.localExterno || 'Não Consta'}
                        </td>
                        <td className="py-3 px-4 font-mono text-gray-600 dark:text-gray-400">
                          {item.processoSei || '—'}
                        </td>
                        <td className="py-3 px-4 text-gray-600 dark:text-gray-400">
                          {formatDate(item.dataArrecadacao)}
                        </td>
                        <td className="py-3 px-4">
                          {item.chip ? (
                            <span className="px-2 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 rounded-full text-[10px] font-bold">
                              {item.chip}
                            </span>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-gray-500 dark:text-gray-400 truncate max-w-[150px]" title={item.responsavel}>
                          {item.responsavel}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Paginação */}
              <div className="p-4 border-t border-gray-200 dark:border-gray-800 flex items-center justify-between gap-4 bg-gray-50/50 dark:bg-gray-850/20 text-xs text-gray-500 dark:text-gray-400 font-semibold shrink-0">
                <span>
                  Mostrando <strong className="text-gray-800 dark:text-white">{(pagination.page - 1) * pagination.limit + 1}</strong> a <strong className="text-gray-800 dark:text-white">{Math.min(pagination.page * pagination.limit, pagination.total)}</strong> de <strong className="text-gray-800 dark:text-white">{pagination.total}</strong> aparelhos
                </span>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => fetchAparelhos(pagination.page - 1)}
                    disabled={pagination.page <= 1}
                    className="p-2 border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 active:scale-95 disabled:opacity-50 disabled:pointer-events-none rounded-xl transition-all"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="px-2">Pág. {pagination.page} de {pagination.totalPages}</span>
                  <button
                    onClick={() => fetchAparelhos(pagination.page + 1)}
                    disabled={pagination.page >= pagination.totalPages}
                    className="p-2 border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 active:scale-95 disabled:opacity-50 disabled:pointer-events-none rounded-xl transition-all"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </>
          )}

        </div>
      </div>

      {/* Modal de Importação CSV */}
      <AnimatePresence>
        {modalImportOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => !uploading && setModalImportOpen(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />

            {/* Conteúdo */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-md bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-3xl p-6 shadow-2xl z-10 text-xs"
            >
              
              <div className="flex justify-between items-center pb-4 border-b border-gray-100 dark:border-gray-800">
                <div className="flex items-center gap-2">
                  <Upload className="w-5 h-5 text-sigma-600 dark:text-sigma-400" />
                  <h3 className="font-bold text-sm text-gray-900 dark:text-white">Importar Planilha CSV</h3>
                </div>
                {!uploading && (
                  <button
                    onClick={() => setModalImportOpen(false)}
                    className="p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-white"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              <form onSubmit={handleImportSubmit} className="pt-4 space-y-4">
                
                {/* Drag & Drop Simples */}
                <div className="border-2 border-dashed border-gray-200 dark:border-gray-800 rounded-2xl p-6 flex flex-col items-center justify-center text-center bg-gray-50/50 dark:bg-gray-950/20 hover:border-sigma-500/50 transition-colors">
                  <Upload className="w-8 h-8 text-gray-400 mb-2" />
                  <label className="cursor-pointer font-bold text-sigma-600 dark:text-sigma-400 hover:underline">
                    Selecionar arquivo CSV
                    <input
                      type="file"
                      accept=".csv"
                      onChange={e => setUploadFile(e.target.files?.[0] || null)}
                      className="hidden"
                      disabled={uploading}
                    />
                  </label>
                  <p className="text-[10px] text-gray-400 mt-1">Apenas arquivos no formato .csv</p>
                  
                  {uploadFile && (
                    <div className="mt-4 p-2 bg-gray-100 dark:bg-gray-800 rounded-lg text-gray-600 dark:text-gray-300 font-medium">
                      📁 {uploadFile.name} ({(uploadFile.size / 1024).toFixed(1)} KB)
                    </div>
                  )}
                </div>

                {/* Sobrescrever dados */}
                <div className="flex items-center justify-between p-3 bg-red-50/50 dark:bg-red-950/10 border border-red-500/10 rounded-xl">
                  <div className="flex gap-2">
                    <ShieldAlert className="w-4 h-4 text-red-500 flex-shrink-0" />
                    <div>
                      <span className="font-bold text-gray-800 dark:text-gray-200 block">Substituir base existente</span>
                      <span className="text-[10px] text-gray-400 block">Deleta todos os aparelhos antigos do banco e recarrega do CSV.</span>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={overwrite}
                    onChange={e => setOverwrite(e.target.checked)}
                    disabled={uploading}
                    className="w-4 h-4 text-red-500 border-gray-300 rounded focus:ring-red-400 accent-red-500"
                  />
                </div>

                {/* Barra de Progresso */}
                {uploading && (
                  <div className="space-y-1">
                    <div className="flex justify-between font-bold text-gray-400 text-[10px]">
                      <span>Enviando e processando...</span>
                      <span>{uploadProgress}%</span>
                    </div>
                    <div className="w-full bg-gray-100 dark:bg-gray-850 h-2 rounded-full overflow-hidden">
                      <div 
                        className="bg-sigma-500 h-full rounded-full transition-all duration-300"
                        style={{ width: `${uploadProgress}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Feedbacks */}
                {uploadError && (
                  <div className="p-3 bg-red-100 dark:bg-red-900/30 border border-red-500/20 text-red-700 dark:text-red-400 rounded-xl flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                    <span>{uploadError}</span>
                  </div>
                )}
                
                {uploadSuccess && (
                  <div className="p-3 bg-green-100 dark:bg-green-900/30 border border-green-500/20 text-green-700 dark:text-green-400 rounded-xl flex items-start gap-2">
                    <CheckCircle className="w-4 h-4 mt-0.5 shrink-0" />
                    <span>{uploadSuccess}</span>
                  </div>
                )}

                {/* Botões */}
                <div className="flex justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setModalImportOpen(false)}
                    disabled={uploading}
                    className="px-4 py-2 border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-850 text-gray-500 dark:text-gray-400 rounded-xl font-bold"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={uploading || !uploadFile}
                    className="px-4 py-2 bg-sigma-600 hover:bg-sigma-550 disabled:opacity-50 text-white rounded-xl font-bold flex items-center gap-1.5"
                  >
                    {uploading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    Começar Importação
                  </button>
                </div>

              </form>
            </motion.div>

          </div>
        )}
      </AnimatePresence>

      {/* Modal de Cadastro Manual */}
      <AnimatePresence>
        {modalCadOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => !cadSaving && setModalCadOpen(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />

            {/* Conteúdo */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-3xl p-6 shadow-2xl z-10 text-xs overflow-y-auto max-h-[90vh]"
            >
              
              <div className="flex justify-between items-center pb-4 border-b border-gray-100 dark:border-gray-800">
                <div className="flex items-center gap-2">
                  <Smartphone className="w-5 h-5 text-sigma-600 dark:text-sigma-400" />
                  <h3 className="font-bold text-sm text-gray-900 dark:text-white">Cadastrar Aparelho / Dispositivo</h3>
                </div>
                {!cadSaving && (
                  <button
                    onClick={() => setModalCadOpen(false)}
                    className="p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-white"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              <form onSubmit={handleCadSubmit} className="pt-4 space-y-4">
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  
                  {/* Responsável */}
                  <div>
                    <label className="block text-gray-400 font-bold mb-1 uppercase tracking-wider text-[9px]">
                      Responsável pelo Registro *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Nome do operador"
                      value={cadForm.responsavel}
                      onChange={e => setCadForm({ ...cadForm, responsavel: e.target.value })}
                      className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-850 border border-gray-200 dark:border-gray-750 rounded-xl text-xs focus:ring-2 focus:ring-sigma-500 focus:outline-none"
                    />
                  </div>

                  {/* Município */}
                  <div>
                    <label className="block text-gray-400 font-bold mb-1 uppercase tracking-wider text-[9px]">
                      Município da Apreensão *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Ex: PORTO VELHO"
                      value={cadForm.municipio}
                      onChange={e => setCadForm({ ...cadForm, municipio: e.target.value })}
                      className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-850 border border-gray-200 dark:border-gray-750 rounded-xl text-xs focus:ring-2 focus:ring-sigma-500 focus:outline-none"
                    />
                  </div>

                  {/* Unidade Prisional */}
                  <div className="md:col-span-2">
                    <label className="block text-gray-400 font-bold mb-1 uppercase tracking-wider text-[9px]">
                      Unidade Prisional *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Selecione ou digite o presídio"
                      value={cadForm.unidadePrisional}
                      onChange={e => setCadForm({ ...cadForm, unidadePrisional: e.target.value })}
                      className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-850 border border-gray-200 dark:border-gray-750 rounded-xl text-xs focus:ring-2 focus:ring-sigma-500 focus:outline-none"
                    />
                  </div>

                  {/* Cela/Pavilhão */}
                  <div>
                    <label className="block text-gray-400 font-bold mb-1 uppercase tracking-wider text-[9px]">
                      Cela / Pavilhão
                    </label>
                    <input
                      type="text"
                      placeholder="Ex: C-08, B-03"
                      value={cadForm.celaPavilhao}
                      onChange={e => setCadForm({ ...cadForm, celaPavilhao: e.target.value })}
                      className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-850 border border-gray-200 dark:border-gray-750 rounded-xl text-xs focus:ring-2 focus:ring-sigma-500 focus:outline-none"
                    />
                  </div>

                  {/* Processo SEI */}
                  <div>
                    <label className="block text-gray-400 font-bold mb-1 uppercase tracking-wider text-[9px]">
                      Processo SEI
                    </label>
                    <input
                      type="text"
                      placeholder="Ex: 0033.xxxxxx/2024-xx"
                      value={cadForm.processoSei}
                      onChange={e => setCadForm({ ...cadForm, processoSei: e.target.value })}
                      className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-850 border border-gray-200 dark:border-gray-750 rounded-xl text-xs focus:ring-2 focus:ring-sigma-500 focus:outline-none font-mono"
                    />
                  </div>

                  {/* Marca Celular */}
                  <div>
                    <label className="block text-gray-400 font-bold mb-1 uppercase tracking-wider text-[9px]">
                      Marca do Celular
                    </label>
                    <input
                      type="text"
                      placeholder="Ex: Samsung, Motorola"
                      value={cadForm.marca}
                      onChange={e => setCadForm({ ...cadForm, marca: e.target.value })}
                      className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-850 border border-gray-200 dark:border-gray-750 rounded-xl text-xs focus:ring-2 focus:ring-sigma-500 focus:outline-none"
                    />
                  </div>

                  {/* Smartwatch / Smartband */}
                  <div>
                    <label className="block text-gray-400 font-bold mb-1 uppercase tracking-wider text-[9px]">
                      SmartWatch / SmartBand
                    </label>
                    <input
                      type="text"
                      placeholder="Ex: Xiaomi, Apple"
                      value={cadForm.smartwatch}
                      onChange={e => setCadForm({ ...cadForm, smartwatch: e.target.value })}
                      className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-850 border border-gray-200 dark:border-gray-750 rounded-xl text-xs focus:ring-2 focus:ring-sigma-500 focus:outline-none"
                    />
                  </div>

                  {/* CHIP / Operadora */}
                  <div>
                    <label className="block text-gray-400 font-bold mb-1 uppercase tracking-wider text-[9px]">
                      CHIP / Operadora
                    </label>
                    <input
                      type="text"
                      placeholder="Ex: Claro, Vivo, Tim"
                      value={cadForm.chip}
                      onChange={e => setCadForm({ ...cadForm, chip: e.target.value })}
                      className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-850 border border-gray-200 dark:border-gray-750 rounded-xl text-xs focus:ring-2 focus:ring-sigma-500 focus:outline-none"
                    />
                  </div>

                  {/* Setor Externo */}
                  <div>
                    <label className="block text-gray-400 font-bold mb-1 uppercase tracking-wider text-[9px]">
                      Setor Externo
                    </label>
                    <input
                      type="text"
                      placeholder="Ex: Horta, Reforma"
                      value={cadForm.unidadeExterna}
                      onChange={e => setCadForm({ ...cadForm, unidadeExterna: e.target.value })}
                      className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-850 border border-gray-200 dark:border-gray-750 rounded-xl text-xs focus:ring-2 focus:ring-sigma-500 focus:outline-none"
                    />
                  </div>

                  {/* Local Externo */}
                  <div>
                    <label className="block text-gray-400 font-bold mb-1 uppercase tracking-wider text-[9px]">
                      Local Externo
                    </label>
                    <input
                      type="text"
                      placeholder="Ex: Próximo à muralha"
                      value={cadForm.localExterno}
                      onChange={e => setCadForm({ ...cadForm, localExterno: e.target.value })}
                      className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-850 border border-gray-200 dark:border-gray-750 rounded-xl text-xs focus:ring-2 focus:ring-sigma-500 focus:outline-none"
                    />
                  </div>

                  {/* Datas */}
                  <div>
                    <label className="block text-gray-400 font-bold mb-1 uppercase tracking-wider text-[9px]">
                      Data Apreensão / Arrecadação
                    </label>
                    <input
                      type="date"
                      value={cadForm.dataArrecadacao}
                      onChange={e => setCadForm({ ...cadForm, dataArrecadacao: e.target.value })}
                      className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-850 border border-gray-200 dark:border-gray-750 rounded-xl text-xs focus:ring-2 focus:ring-sigma-500 focus:outline-none text-gray-600 dark:text-gray-200"
                    />
                  </div>

                  <div>
                    <label className="block text-gray-400 font-bold mb-1 uppercase tracking-wider text-[9px]">
                      Data Recebimento na GIP
                    </label>
                    <input
                      type="date"
                      value={cadForm.dataRecebimento}
                      onChange={e => setCadForm({ ...cadForm, dataRecebimento: e.target.value })}
                      className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-850 border border-gray-200 dark:border-gray-750 rounded-xl text-xs focus:ring-2 focus:ring-sigma-500 focus:outline-none text-gray-600 dark:text-gray-200"
                    />
                  </div>

                </div>

                {/* Feedbacks */}
                {cadError && (
                  <div className="p-3 bg-red-100 dark:bg-red-900/30 border border-red-500/20 text-red-700 dark:text-red-400 rounded-xl flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                    <span>{cadError}</span>
                  </div>
                )}
                
                {cadSuccess && (
                  <div className="p-3 bg-green-100 dark:bg-green-900/30 border border-green-500/20 text-green-700 dark:text-green-400 rounded-xl flex items-start gap-2">
                    <CheckCircle className="w-4 h-4 mt-0.5 shrink-0" />
                    <span>Dispositivo salvo com sucesso!</span>
                  </div>
                )}

                {/* Botões */}
                <div className="flex justify-end gap-3 pt-2 border-t border-gray-100 dark:border-gray-800">
                  <button
                    type="button"
                    onClick={() => setModalCadOpen(false)}
                    disabled={cadSaving}
                    className="px-4 py-2 border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-850 text-gray-500 dark:text-gray-400 rounded-xl font-bold"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={cadSaving}
                    className="px-4 py-2 bg-sigma-600 hover:bg-sigma-550 disabled:opacity-50 text-white rounded-xl font-bold flex items-center gap-1.5"
                  >
                    {cadSaving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    Salvar Registro
                  </button>
                </div>

              </form>
            </motion.div>

          </div>
        )}
      </AnimatePresence>

    </div>
  )
}
