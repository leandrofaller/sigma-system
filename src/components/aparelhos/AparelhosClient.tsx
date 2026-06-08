'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  Smartphone, Search, Plus, Upload, Filter, Loader2, X, 
  Calendar, MapPin, Building2, User, FileText, CheckCircle, 
  AlertTriangle, ChevronLeft, ChevronRight, BarChart2, ShieldAlert, Cpu, Radio,
  TrendingUp, PieChart as PieIcon, Wifi
} from 'lucide-react'
import { 
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, 
  PieChart, Pie, Cell, Legend, AreaChart, Area, CartesianGrid
} from 'recharts'
import { useTheme } from '@/components/providers/ThemeProvider'

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
  totalCelulares: number
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

interface DashboardStats {
  total: number
  celularesCount: number
  unidades: { name: string; count: number }[]
  marcas: { name: string; count: number }[]
  municipios: { name: string; count: number }[]
  chips: { name: string; count: number }[]
  timeline: { date: string; Quantidade: number }[]
  smartwatchesCount: number
  chipCount: number
  locais: { interno: number; externo: number; naoConsta: number }
}

const RESPONSAVEIS_OPCOES = [
  'VALTEIR SOARES DA SILVA',
  'RAFAEL CHAGAS SENA',
  'JOSÉ DOS SANTOS SIQUEIRA',
  'LEANDRO PINHO FALLER',
  'JEFFERSON DE BRITO ROCHA',
  'STAUNSTON ROCHA MENDES',
  'SIDNEI TEODORO SEBASTIÃO',
  'GEAN PEREIRA ACRISIO',
  'JORDANIO PINHEIRO BATISTA'
]

const MUNICIPIOS_OPCOES = [
  'PORTO VELHO',
  'ALVORADA DO OESTE',
  'ALTA FLORESTA',
  'ARIQUEMES',
  'BURITIS',
  'CACOAL',
  'CEREJEIRAS',
  'COLORADO DO OESTE',
  'COSTA MARQUES',
  'GUAJARÁ MIRIM',
  'JARU',
  'JI-PARANÁ',
  'MACHADINHO DO OESTE',
  'NOVA MAMORÉ',
  'OURO PRETO',
  'PIMENTA BUENO',
  'PRESIDENTE MÉDICE',
  'ROLIM DE MOURA',
  'SÃO MIGUEL DO GUAPORÉ',
  'SÃO FRANCISCO DO GUAPORÉ',
  'VILHENA'
]

const UNIDADES_OPCOES = [
  'PENITENCIÁRIA ESTADUAL EDIVAN MARIANO ROSENDO - (PANDA)',
  'PENITENCIÁRIA ESTADUAL MILTON SOARES DE CARVALHO (470)',
  'PENITENCIÁRIA ESTADUAL JORGE THIAGO AGUIAR AFONSO',
  'PENITENCIÁRIA ESTADUAL ARUANA',
  'PENITENCIÁRIA DE MÉDIO PORTE - (ANTIGO ÊNIO)',
  'CENTRO DE DETENÇÃO PROVISÓRIO DE PORTO VELHO (ANTIGO URSO)',
  'CENTRO DE RESSOCIALIZAÇÃO SUELY MARIA MENDONÇA (PENFEN e PEPFEM UNIFICADAS)',
  'CENTRO DE RESSOCIALIZAÇÃO VALE DO GUAPORÉ (CRVG)',
  'COLÔNIA AGRÍCOLA PENAL ÊNIO DOS SANTOS PINHEIRO - (CAPEP)',
  'UNIDADE DE INTERNAÇÃO MASCULINA MEDIDAS DE SEGURANÇA',
  'UNIDADE DE MONITORAMENTO ELETRÔNICO - UMESP (CAPITAL)',
  'UNIDADE SEMIABERTO E ABERTO FEMININO E ALBERGUE MASCULINO - USAFAM',
  'PENITENCIÁRIA REGIONAL DE NOVA MAMORÉ',
  'CASA DE DETENÇÃO DE GUAJARÁ MIRIM',
  'CASA DE PRISÃO ALBERGUE FEMININO DE GUAJARÁ MIRIM',
  'UNIDADE SEMIABERTO E ABERTO MASCULINO DE GUAJARÁ MIRIM',
  'CENTRO DE RESSOCIALIZAÇÃO DE ARIQUEMES',
  'CASA DO ALBERGADO E PRESÍDIO FEMININO DE ARIQUEMES',
  'CENTRO DE RESSOCIALIZAÇÃO JONAS FERRETI',
  'CENTRO DE RESSOCIALIZAÇÃO DE MACHADINHO DO OESTE',
  'CENTRO REGIONAL DE RESSOCIALIZAÇÃO AUGUSTO S.KEMPE',
  'CASA DE PRISÃO ALBERGUE DE JARU E SEMIABERTO',
  'CASA DE DETENÇÃO DE OURO PRETO',
  'CASA DE DETENÇÃO DE JI-PARANÁ',
  'UNIDADE DE MONITORAMENTO DE JI-PARANÁ',
  'PRESÍDIO SEMIABERTO DE JI-PARANÁ',
  'PENITENCIÁRIA REGIONAL DR. AGENOR MARTINS DE CARVALHO',
  'CADEIA PÚBLICA DE PRESIDENTE MÉDICI',
  'CENTRO DE RESSOCIALIZAÇÃO YOHAN FLÁVIO VASSOLER',
  'CADEIA PÚBLICA DE SÃO MIGUEL DO GUAPORÉ',
  'CADEIA PÚBLICA DE SÃO FRANCISCO DO GUAPORÉ',
  'CADEIA PÚBLICA DE COSTA MARQUES',
  'CASA DE DETENÇÃO DE CACOAL',
  'CASA DE PRISÃO ALBERGUE MASCULINO DE CACOAL - MONITORAMENTO',
  'CASA DE DETENÇÃO DE ROLIM DE MOURA',
  'UNIDADE ABERTO E SEMIABERTO DE ROLIM DE MOURA - MONITORAMENTO',
  'PENITENCIÁRIA REGIONAL DE ROLIM DE MOURA',
  'CASA DE DETENÇÃO DE PIMENTA BUENO',
  'CADEIA PÚBLICA DE ALTA FLORESTA',
  'CASA DE DETENÇÃO DE VILHENA',
  'COLÔNIA PENAL, MONITORAMENTO E PRESÍDIO FEMININO DE VILHENA',
  'CENTRO DE RESSOCIALIZAÇÃO CONE SUL',
  'CADEIA PÚBLICA DE COLORADO DO OESTE',
  'CADEIA PÚBLICA DE CEREJEIRAS',
  'SISTEMA SOCIOEDUCATIVO',
  'OUTRO (DETALHAR)'
]

const LOCAIS_EXTERNOS_OPCOES = [
  'RUA AO LADO DA UNIDADE',
  'RUA PROXIMA A UNIDADE',
  'ENTRE UNIDADES DISTINTAS',
  'APENADOS DE CONVENIOS',
  'MONITORADO',
  'OUTROS'
]

const CHIPS_OPCOES = [
  'Claro',
  'Vivo',
  'Tim',
  'OI',
  'Outros'
]

const MARCAS_OPCOES = [
  'LG',
  'Motorola',
  'Samsung',
  'Semp Toshiba',
  'Sony Ericsson',
  'Venko',
  'Iphone',
  'Xiaomi',
  'Multilaser',
  'Mini L8Star',
  'Mini Smartphone',
  'NOKIA',
  'Poco',
  'Positivo',
  'Redmi',
  'Realme',
  'Satelital (conexão via satelite)',
  'HUAWEI',
  'Asus',
  'Blue',
  'Outros'
]

const SMARTWATCHES_OPCOES = [
  'Apple',
  'Samsung',
  'Xiaomi',
  'GENERICOS'
]

export function AparelhosClient() {
  const { theme } = useTheme()
  const isDark = theme === 'dark'

  // Estados principais
  const [activeTab, setActiveTab] = useState<'list' | 'dashboard'>('list')
  const [aparelhos, setAparelhos] = useState<Aparelho[]>([])
  const [pagination, setPagination] = useState<Pagination>({ total: 0, totalCelulares: 0, page: 1, limit: 15, totalPages: 1 })
  const [stats, setStats] = useState<Stats>({ marcas: [], unidades: [] })
  const [loading, setLoading] = useState(true)

  // Estados do Dashboard
  const [dbStats, setDbStats] = useState<DashboardStats | null>(null)
  const [loadingDbStats, setLoadingDbStats] = useState(false)

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
  const [isOutroUnidade, setIsOutroUnidade] = useState(false)
  const [outroUnidadeTexto, setOutroUnidadeTexto] = useState('')

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

  // Carregar dados de estatísticas do dashboard
  const fetchDashboardStats = useCallback(async () => {
    setLoadingDbStats(true)
    try {
      const params = new URLSearchParams({
        search,
        unidade,
        municipio,
        marca,
        dataInicio,
        dataFim,
      })

      const res = await fetch(`/api/aparelhos/stats?${params.toString()}`)
      if (!res.ok) throw new Error('Erro ao buscar estatísticas do dashboard')
      
      const json = await res.json()
      setDbStats(json)
    } catch (err) {
      console.error(err)
    } finally {
      setLoadingDbStats(false)
    }
  }, [search, unidade, municipio, marca, dataInicio, dataFim])

  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      if (activeTab === 'list') {
        fetchAparelhos(1)
      } else {
        fetchDashboardStats()
      }
    }, 400)

    return () => clearTimeout(delayDebounceFn)
  }, [search, unidade, municipio, marca, dataInicio, dataFim, activeTab, fetchAparelhos, fetchDashboardStats])

  // Limpar Filtros
  const handleClearFilters = () => {
    setSearch('')
    setUnidade('')
    setMunicipio('')
    setMarca('')
    setDataInicio('')
    setDataFim('')
    
    // Pequeno timeout para permitir que os estados de filtro sejam zerados antes de buscar
    setTimeout(() => {
      if (activeTab === 'list') {
        fetchAparelhos(1)
      } else {
        fetchDashboardStats()
      }
    }, 50)
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
      const finalUnidade = isOutroUnidade ? outroUnidadeTexto.trim().toUpperCase() : cadForm.unidadePrisional

      if (!cadForm.responsavel || !cadForm.municipio || !finalUnidade) {
        throw new Error('Responsável, Município e Unidade Prisional são obrigatórios.')
      }

      const payload = {
        ...cadForm,
        unidadePrisional: finalUnidade,
      }

      const res = await fetch('/api/aparelhos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
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
      setIsOutroUnidade(false)
      setOutroUnidadeTexto('')

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

      {/* Abas */}
      <div className="flex border-b border-gray-200 dark:border-gray-800 px-6 bg-white dark:bg-gray-900 shrink-0">
        <button
          onClick={() => setActiveTab('list')}
          className={`py-3 px-4 text-xs font-bold border-b-2 transition-all flex items-center gap-2 ${
            activeTab === 'list'
              ? 'border-sigma-600 text-sigma-600 dark:border-sigma-400 dark:text-sigma-400'
              : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
          }`}
        >
          <Smartphone className="w-4 h-4" />
          Lista de Aparelhos
        </button>
        <button
          onClick={() => setActiveTab('dashboard')}
          className={`py-3 px-4 text-xs font-bold border-b-2 transition-all flex items-center gap-2 ${
            activeTab === 'dashboard'
              ? 'border-sigma-600 text-sigma-600 dark:border-sigma-400 dark:text-sigma-400'
              : 'border-transparent text-gray-500 hover:text-gray-750 dark:hover:text-gray-300'
          }`}
        >
          <BarChart2 className="w-4 h-4" />
          Painel Estatístico (Dashboard)
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        
        {/* Barra de Filtros Avançados (Compartilhada entre as abas) */}
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

        {/* ==================== ABA 1: LISTAGEM PADRÃO ==================== */}
        {activeTab === 'list' && (
          <>
            {/* Painel de Estatísticas com Visual Rico */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              
              {/* Card 1: Total de Registros */}
              <div className="relative overflow-hidden p-5 bg-gradient-to-br from-blue-500/10 via-transparent to-transparent border border-blue-500/10 dark:bg-gray-900 rounded-2xl shadow-sm flex items-center justify-between">
                <div>
                  <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider block mb-1">
                    Total de Registros
                  </span>
                  {loading ? (
                    <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                  ) : (
                    <span className="text-3xl font-black tracking-tight text-blue-600 dark:text-blue-400">
                      {pagination.total}
                    </span>
                  )}
                  <span className="text-[10px] text-gray-400 block mt-1">Registros consolidados no sistema</span>
                </div>
                <div className="p-3 bg-blue-500/15 text-blue-600 dark:text-blue-400 rounded-xl">
                  <FileText className="w-8 h-8" />
                </div>
              </div>

              {/* Card 2: Aparelhos Celulares */}
              <div className="relative overflow-hidden p-5 bg-gradient-to-br from-sigma-600/10 via-transparent to-transparent border border-sigma-500/10 dark:bg-gray-900 rounded-2xl shadow-sm flex items-center justify-between">
                <div>
                  <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider block mb-1">
                    Aparelhos Celulares
                  </span>
                  {loading ? (
                    <Loader2 className="w-8 h-8 animate-spin text-sigma-500" />
                  ) : (
                    <span className="text-3xl font-black tracking-tight text-sigma-600 dark:text-sigma-400">
                      {pagination.totalCelulares}
                    </span>
                  )}
                  <span className="text-[10px] text-gray-400 block mt-1">Celulares apreendidos (com marca)</span>
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
                    stats.marcas.slice(0, 3).map((item) => {
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
                    stats.unidades.slice(0, 3).map((item) => {
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
          </>
        )}

        {/* ==================== ABA 2: DASHBOARD ANALÍTICO ==================== */}
        {activeTab === 'dashboard' && (
          <div className="space-y-6">
            
            {/* Grid de KPIs do Dashboard */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
              
              {/* Card 1: Total de Registros */}
              <div className="relative overflow-hidden p-5 bg-gradient-to-br from-blue-500/10 via-transparent to-transparent border border-blue-500/15 dark:bg-gray-900 rounded-2xl shadow-sm flex items-center justify-between group hover:shadow-md hover:border-blue-500/30 transition-all">
                <div className="space-y-1">
                  <span className="text-[10px] uppercase font-black tracking-wider text-gray-400 dark:text-gray-500 block">
                    Total de Registros
                  </span>
                  {loadingDbStats ? (
                    <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                  ) : (
                    <h3 className="text-3xl font-black text-gray-900 dark:text-white tracking-tight">
                      {dbStats?.total || 0}
                    </h3>
                  )}
                  <span className="text-[10px] text-gray-500 block">Total de linhas no banco</span>
                </div>
                <div className="w-12 h-12 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                  <FileText className="w-6 h-6" />
                </div>
              </div>

              {/* Card 2: Aparelhos Celulares */}
              <div className="relative overflow-hidden p-5 bg-gradient-to-br from-indigo-500/10 via-transparent to-transparent border border-indigo-500/15 dark:bg-gray-900 rounded-2xl shadow-sm flex items-center justify-between group hover:shadow-md hover:border-indigo-500/30 transition-all">
                <div className="space-y-1">
                  <span className="text-[10px] uppercase font-black tracking-wider text-gray-400 dark:text-gray-500 block">
                    Aparelhos Celulares
                  </span>
                  {loadingDbStats ? (
                    <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
                  ) : (
                    <div className="flex items-baseline gap-1.5">
                      <h3 className="text-3xl font-black text-gray-900 dark:text-white tracking-tight">
                        {dbStats?.celularesCount || 0}
                      </h3>
                      <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400">
                        ({dbStats?.total ? Math.round(((dbStats.celularesCount || 0) / dbStats.total) * 100) : 0}%)
                      </span>
                    </div>
                  )}
                  <span className="text-[10px] text-gray-500 block">Celulares apreendidos (com marca)</span>
                </div>
                <div className="w-12 h-12 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                  <Smartphone className="w-6 h-6" />
                </div>
              </div>

              {/* Card 2: Aparelhos com CHIP */}
              <div className="relative overflow-hidden p-5 bg-gradient-to-br from-emerald-500/10 via-transparent to-transparent border border-emerald-500/15 dark:bg-gray-900 rounded-2xl shadow-sm flex items-center justify-between group hover:shadow-md hover:border-emerald-500/30 transition-all">
                <div className="space-y-1">
                  <span className="text-[10px] uppercase font-black tracking-wider text-gray-400 dark:text-gray-500 block">
                    Aparelhos com CHIP
                  </span>
                  {loadingDbStats ? (
                    <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
                  ) : (
                    <div className="flex items-baseline gap-1.5">
                      <h3 className="text-3xl font-black text-gray-900 dark:text-white tracking-tight">
                        {dbStats?.chipCount || 0}
                      </h3>
                      <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                        ({dbStats?.total ? Math.round(((dbStats.chipCount || 0) / dbStats.total) * 100) : 0}%)
                      </span>
                    </div>
                  )}
                  <span className="text-[10px] text-gray-500 block">Dispositivos com linha ativa</span>
                </div>
                <div className="w-12 h-12 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                  <Wifi className="w-6 h-6" />
                </div>
              </div>

              {/* Card 3: Smartwatches / bands */}
              <div className="relative overflow-hidden p-5 bg-gradient-to-br from-amber-500/10 via-transparent to-transparent border border-amber-500/15 dark:bg-gray-900 rounded-2xl shadow-sm flex items-center justify-between group hover:shadow-md hover:border-amber-500/30 transition-all">
                <div className="space-y-1">
                  <span className="text-[10px] uppercase font-black tracking-wider text-gray-400 dark:text-gray-500 block">
                    Smartwatches Apreendidos
                  </span>
                  {loadingDbStats ? (
                    <Loader2 className="w-8 h-8 animate-spin text-amber-500" />
                  ) : (
                    <h3 className="text-3xl font-black text-gray-900 dark:text-white tracking-tight">
                      {dbStats?.smartwatchesCount || 0}
                    </h3>
                  )}
                  <span className="text-[10px] text-gray-500 block">Relógios inteligentes vinculados</span>
                </div>
                <div className="w-12 h-12 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                  <Cpu className="w-6 h-6" />
                </div>
              </div>

              {/* Card 4: Unidade mais afetada */}
              <div className="relative overflow-hidden p-5 bg-gradient-to-br from-red-500/10 via-transparent to-transparent border border-red-500/15 dark:bg-gray-900 rounded-2xl shadow-sm flex items-center justify-between group hover:shadow-md hover:border-red-500/30 transition-all">
                <div className="space-y-1 min-w-0">
                  <span className="text-[10px] uppercase font-black tracking-wider text-gray-400 dark:text-gray-500 block">
                    Maior Incidência
                  </span>
                  {loadingDbStats ? (
                    <Loader2 className="w-8 h-8 animate-spin text-red-500" />
                  ) : (
                    <h3 className="text-sm font-black text-gray-900 dark:text-white tracking-tight truncate max-w-[170px]" title={dbStats?.unidades?.[0]?.name || 'Nenhuma'}>
                      {dbStats?.unidades?.[0]?.name || 'Nenhuma'}
                    </h3>
                  )}
                  <span className="text-[10px] text-gray-500 block">
                    {dbStats?.unidades?.[0]?.count ? `${dbStats.unidades[0].count} apreensões registradas` : 'Sem registros'}
                  </span>
                </div>
                <div className="w-12 h-12 rounded-xl bg-red-500/10 text-red-600 dark:text-red-400 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                  <Building2 className="w-6 h-6" />
                </div>
              </div>
            </div>

            {/* Conteúdo de Gráficos */}
            {loadingDbStats ? (
              <div className="flex flex-col items-center justify-center min-h-[400px] text-gray-400 gap-3 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-3xl p-8 shadow-sm">
                <Loader2 className="w-8 h-8 text-sigma-600 dark:text-sigma-400 animate-spin" />
                <p className="text-xs font-bold animate-pulse">Carregando dados estatísticos avançados...</p>
              </div>
            ) : !dbStats || dbStats.total === 0 ? (
              <div className="flex flex-col items-center justify-center min-h-[400px] text-gray-400 gap-3 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-3xl p-8 shadow-sm text-center">
                <AlertTriangle className="w-12 h-12 text-amber-500 animate-bounce" />
                <p className="font-bold text-gray-700 dark:text-gray-300 text-sm">Nenhum dado estatístico encontrado</p>
                <p className="text-xs text-gray-400 max-w-xs">Tente ajustar ou limpar seus filtros para exibir os gráficos estatísticos do painel.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                
                {/* Gráfico 1: Evolução das Apreensões no Tempo (Área) */}
                <div className="bg-white dark:bg-gray-900 p-6 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm flex flex-col">
                  <h3 className="text-xs font-black text-gray-900 dark:text-white uppercase tracking-wider mb-4 flex items-center gap-1.5">
                    <TrendingUp className="w-4 h-4 text-sigma-500" />
                    Evolução das Apreensões no Tempo
                  </h3>
                  <div className="flex-1 min-h-[280px]">
                    {dbStats.timeline.length === 0 ? (
                      <div className="h-full flex items-center justify-center text-xs text-gray-400">Sem histórico temporal disponível</div>
                    ) : (
                      <ResponsiveContainer width="100%" height={280}>
                        <AreaChart data={dbStats.timeline} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                          <defs>
                            <linearGradient id="colorQuant" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#6172f3" stopOpacity={0.3}/>
                              <stop offset="95%" stopColor="#6172f3" stopOpacity={0.0}/>
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#1f2937' : '#f3f4f6'} />
                          <XAxis dataKey="date" tick={{ fontSize: 9, fill: isDark ? '#9ca3af' : '#6b7280' }} axisLine={false} tickLine={false} />
                          <YAxis tick={{ fontSize: 9, fill: isDark ? '#9ca3af' : '#6b7280' }} axisLine={false} tickLine={false} />
                          <Tooltip
                            contentStyle={{
                              background: isDark ? '#111827' : '#ffffff',
                              border: `1px solid ${isDark ? '#374151' : '#e5e7eb'}`,
                              borderRadius: '12px',
                              fontSize: '11px',
                              color: isDark ? '#f3f4f6' : '#111827'
                            }}
                            labelStyle={{ fontWeight: 700 }}
                          />
                          <Area type="monotone" dataKey="Quantidade" stroke="#6172f3" strokeWidth={2} fillOpacity={1} fill="url(#colorQuant)" />
                        </AreaChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                </div>

                {/* Gráfico 2: Unidades com Maior Incidência (BarChart Horizontal) */}
                <div className="bg-white dark:bg-gray-900 p-6 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm flex flex-col">
                  <h3 className="text-xs font-black text-gray-900 dark:text-white uppercase tracking-wider mb-4 flex items-center gap-1.5">
                    <Building2 className="w-4 h-4 text-red-500" />
                    Unidades de Maior Incidência (Top 10)
                  </h3>
                  <div className="flex-1 min-h-[280px]">
                    <ResponsiveContainer width="100%" height={280}>
                      <BarChart
                        data={dbStats.unidades.slice(0, 10).map(u => ({ ...u, displayName: u.name.length > 25 ? u.name.slice(0, 22) + '...' : u.name }))}
                        layout="vertical"
                        margin={{ top: 5, right: 15, left: -10, bottom: 5 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={isDark ? '#1f2937' : '#f3f4f6'} />
                        <XAxis type="number" tick={{ fontSize: 9, fill: isDark ? '#9ca3af' : '#6b7280' }} axisLine={false} tickLine={false} />
                        <YAxis type="category" dataKey="displayName" tick={{ fontSize: 8, fill: isDark ? '#9ca3af' : '#6b7280', width: 110 }} width={110} axisLine={false} tickLine={false} />
                        <Tooltip
                          contentStyle={{
                            background: isDark ? '#111827' : '#ffffff',
                            border: `1px solid ${isDark ? '#374151' : '#e5e7eb'}`,
                            borderRadius: '12px',
                            fontSize: '11px',
                            color: isDark ? '#f3f4f6' : '#111827'
                          }}
                          formatter={(value) => [`${value} aparelhos`, 'Apreensões']}
                        />
                        <Bar dataKey="count" fill="#ef4444" radius={[0, 4, 4, 0]} barSize={12} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Gráfico 3: Marcas de Aparelhos (Donut) */}
                <div className="bg-white dark:bg-gray-900 p-6 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm flex flex-col">
                  <h3 className="text-xs font-black text-gray-900 dark:text-white uppercase tracking-wider mb-4 flex items-center gap-1.5">
                    <PieIcon className="w-4 h-4 text-emerald-500" />
                    Distribuição por Marca do Celular
                  </h3>
                  <div className="flex-1 flex flex-col sm:flex-row items-center justify-center gap-6 min-h-[250px]">
                    <div className="w-full sm:w-1/2 h-[200px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={dbStats.marcas.slice(0, 7)}
                            cx="50%"
                            cy="50%"
                            innerRadius={50}
                            outerRadius={70}
                            paddingAngle={3}
                            dataKey="count"
                            nameKey="name"
                          >
                            {dbStats.marcas.slice(0, 7).map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={['#6172f3', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4'][index % 7]} />
                            ))}
                          </Pie>
                          <Tooltip
                            contentStyle={{
                              background: isDark ? '#111827' : '#ffffff',
                              border: `1px solid ${isDark ? '#374151' : '#e5e7eb'}`,
                              borderRadius: '12px',
                              fontSize: '11px'
                            }}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    
                    <div className="w-full sm:w-1/2 space-y-2 max-h-[200px] overflow-y-auto pr-2">
                      {dbStats.marcas.slice(0, 7).map((item, index) => {
                        const percentage = dbStats.total > 0 ? ((item.count / dbStats.total) * 100).toFixed(1) : '0'
                        return (
                          <div key={item.name} className="flex items-center justify-between text-xs">
                            <div className="flex items-center gap-2 min-w-0">
                              <span 
                                className="w-2.5 h-2.5 rounded-full shrink-0" 
                                style={{ backgroundColor: ['#6172f3', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4'][index % 7] }}
                              />
                              <span className="text-gray-700 dark:text-gray-300 font-medium truncate">{item.name}</span>
                            </div>
                            <span className="text-gray-500 font-mono shrink-0">{item.count} ({percentage}%)</span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>

                {/* Gráfico 4: Distribuição por Operadora/CHIP (Colunas) */}
                <div className="bg-white dark:bg-gray-900 p-6 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm flex flex-col">
                  <h3 className="text-xs font-black text-gray-900 dark:text-white uppercase tracking-wider mb-4 flex items-center gap-1.5">
                    <Wifi className="w-4 h-4 text-indigo-500" />
                    Chips Apreendidos por Operadora
                  </h3>
                  <div className="flex-1 min-h-[250px]">
                    {dbStats.chips.length === 0 ? (
                      <div className="h-full flex items-center justify-center text-xs text-gray-400">Sem dados de chips cadastrados</div>
                    ) : (
                      <ResponsiveContainer width="100%" height={250}>
                        <BarChart data={dbStats.chips.slice(0, 6)} margin={{ top: 10, right: 10, left: -25, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={isDark ? '#1f2937' : '#f3f4f6'} />
                          <XAxis dataKey="name" tick={{ fontSize: 9, fill: isDark ? '#9ca3af' : '#6b7280' }} axisLine={false} tickLine={false} />
                          <YAxis tick={{ fontSize: 9, fill: isDark ? '#9ca3af' : '#6b7280' }} axisLine={false} tickLine={false} />
                          <Tooltip
                            contentStyle={{
                              background: isDark ? '#111827' : '#ffffff',
                              border: `1px solid ${isDark ? '#374151' : '#e5e7eb'}`,
                              borderRadius: '12px',
                              fontSize: '11px'
                            }}
                            formatter={(value) => [`${value} chips`, 'Total']}
                          />
                          <Bar dataKey="count" fill="#8b5cf6" radius={[4, 4, 0, 0]} barSize={25} />
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                </div>

                {/* Gráfico 5: Local de Apreensão (Donut/Pie) */}
                <div className="bg-white dark:bg-gray-900 p-6 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm flex flex-col xl:col-span-2">
                  <h3 className="text-xs font-black text-gray-900 dark:text-white uppercase tracking-wider mb-4 flex items-center gap-1.5">
                    <MapPin className="w-4 h-4 text-amber-500" />
                    Perfil do Local de Apreensão
                  </h3>
                  <div className="flex-1 flex flex-col sm:flex-row items-center justify-center gap-10 min-h-[220px]">
                    <div className="w-full sm:w-1/2 h-[180px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={[
                              { name: 'Interno (Cela / Pavilhão)', count: dbStats.locais.interno, color: '#ef4444' },
                              { name: 'Externo (Setor / Local Externo)', count: dbStats.locais.externo, color: '#f59e0b' },
                              { name: 'Não Especificado', count: dbStats.locais.naoConsta, color: '#9ca3af' }
                            ].filter(l => l.count > 0)}
                            cx="50%"
                            cy="50%"
                            innerRadius={45}
                            outerRadius={65}
                            paddingAngle={3}
                            dataKey="count"
                            nameKey="name"
                          >
                            {[
                              { name: 'Interno (Cela / Pavilhão)', count: dbStats.locais.interno, color: '#ef4444' },
                              { name: 'Externo (Setor / Local Externo)', count: dbStats.locais.externo, color: '#f59e0b' },
                              { name: 'Não Especificado', count: dbStats.locais.naoConsta, color: '#9ca3af' }
                            ].filter(l => l.count > 0).map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                          </Pie>
                          <Tooltip
                            contentStyle={{
                              background: isDark ? '#111827' : '#ffffff',
                              border: `1px solid ${isDark ? '#374151' : '#e5e7eb'}`,
                              borderRadius: '12px',
                              fontSize: '11px'
                            }}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    
                    <div className="w-full sm:w-1/2 space-y-3 pr-2">
                      {[
                        { name: 'Interno (Cela / Pavilhão)', count: dbStats.locais.interno, color: '#ef4444', desc: 'Apreendido dentro de carceragens/pavilhões.' },
                        { name: 'Externo (Setores externos / Muralha)', count: dbStats.locais.externo, color: '#f59e0b', desc: 'Apreendido fora do pavilhão, muralha, horta, etc.' },
                        { name: 'Não Especificado', count: dbStats.locais.naoConsta, color: '#9ca3af', desc: 'Sem especificação detalhada de local.' }
                      ].map((item) => {
                        const percentage = dbStats.total > 0 ? ((item.count / dbStats.total) * 100).toFixed(1) : '0'
                        return (
                          <div key={item.name} className="flex flex-col gap-0.5 text-xs">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                                <span className="text-gray-700 dark:text-gray-300 font-bold truncate">{item.name}</span>
                              </div>
                              <span className="text-gray-500 font-mono font-bold shrink-0">{item.count} ({percentage}%)</span>
                            </div>
                            <span className="text-[10px] text-gray-400 pl-5">{item.desc}</span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>

              </div>
            )}
          </div>
        )}

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
                    <select
                      required
                      value={cadForm.responsavel}
                      onChange={e => setCadForm({ ...cadForm, responsavel: e.target.value })}
                      className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-850 border border-gray-200 dark:border-gray-750 rounded-xl text-xs focus:ring-2 focus:ring-sigma-500 focus:outline-none text-gray-750 dark:text-gray-200"
                    >
                      <option value="">Selecione o Responsável</option>
                      {RESPONSAVEIS_OPCOES.map(resp => (
                        <option key={resp} value={resp}>{resp}</option>
                      ))}
                    </select>
                  </div>

                  {/* Município */}
                  <div>
                    <label className="block text-gray-400 font-bold mb-1 uppercase tracking-wider text-[9px]">
                      Município da Apreensão *
                    </label>
                    <select
                      required
                      value={cadForm.municipio}
                      onChange={e => setCadForm({ ...cadForm, municipio: e.target.value })}
                      className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-850 border border-gray-200 dark:border-gray-750 rounded-xl text-xs focus:ring-2 focus:ring-sigma-500 focus:outline-none text-gray-750 dark:text-gray-200"
                    >
                      <option value="">Selecione o Município</option>
                      {MUNICIPIOS_OPCOES.map(mun => (
                        <option key={mun} value={mun}>{mun}</option>
                      ))}
                    </select>
                  </div>

                  {/* Unidade Prisional */}
                  <div className="md:col-span-2 space-y-2">
                    <label className="block text-gray-400 font-bold mb-0.5 uppercase tracking-wider text-[9px]">
                      Unidade Prisional *
                    </label>
                    <select
                      required
                      value={isOutroUnidade ? 'OUTRO (DETALHAR)' : cadForm.unidadePrisional}
                      onChange={e => {
                        const val = e.target.value
                        if (val === 'OUTRO (DETALHAR)') {
                          setIsOutroUnidade(true)
                          setCadForm(prev => ({ ...prev, unidadePrisional: '' }))
                        } else {
                          setIsOutroUnidade(false)
                          setCadForm(prev => ({ ...prev, unidadePrisional: val }))
                        }
                      }}
                      className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-850 border border-gray-200 dark:border-gray-750 rounded-xl text-xs focus:ring-2 focus:ring-sigma-500 focus:outline-none text-gray-750 dark:text-gray-200"
                    >
                      <option value="">Selecione a Unidade Prisional</option>
                      {UNIDADES_OPCOES.map(uni => (
                        <option key={uni} value={uni}>{uni}</option>
                      ))}
                    </select>

                    {isOutroUnidade && (
                      <motion.div
                        initial={{ opacity: 0, y: -5 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="space-y-1"
                      >
                        <label className="block text-gray-400 font-bold uppercase tracking-wider text-[9px]">
                          Especifique a Unidade Prisional *
                        </label>
                        <input
                          type="text"
                          required
                          placeholder="Digite o nome completo da Unidade Prisional"
                          value={outroUnidadeTexto}
                          onChange={e => setOutroUnidadeTexto(e.target.value)}
                          className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-850 border border-gray-200 dark:border-gray-750 rounded-xl text-xs focus:ring-2 focus:ring-sigma-500 focus:outline-none text-gray-750 dark:text-gray-200"
                        />
                      </motion.div>
                    )}
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
                    <select
                      value={cadForm.marca || ''}
                      onChange={e => setCadForm({ ...cadForm, marca: e.target.value })}
                      className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-850 border border-gray-200 dark:border-gray-750 rounded-xl text-xs focus:ring-2 focus:ring-sigma-500 focus:outline-none text-gray-750 dark:text-gray-200"
                    >
                      <option value="">Sem celular / Não se aplica</option>
                      {MARCAS_OPCOES.map(marcaOpt => (
                        <option key={marcaOpt} value={marcaOpt}>{marcaOpt}</option>
                      ))}
                    </select>
                  </div>

                  {/* Smartwatch / Smartband */}
                  <div>
                    <label className="block text-gray-400 font-bold mb-1.5 uppercase tracking-wider text-[9px]">
                      SmartWatch / SmartBand
                    </label>
                    <div className="grid grid-cols-2 gap-2 bg-gray-50/50 dark:bg-gray-850/50 p-2 border border-gray-200 dark:border-gray-750 rounded-xl">
                      <label className="flex items-center gap-1.5 cursor-pointer py-1 text-[11px] font-semibold text-gray-700 dark:text-gray-300">
                        <input
                          type="radio"
                          name="smartwatch"
                          value=""
                          checked={!cadForm.smartwatch}
                          onChange={() => setCadForm({ ...cadForm, smartwatch: '' })}
                          className="w-3.5 h-3.5 text-sigma-600 focus:ring-sigma-500 border-gray-300 accent-sigma-600"
                        />
                        Não se aplica
                      </label>
                      {SMARTWATCHES_OPCOES.map(opt => (
                        <label key={opt} className="flex items-center gap-1.5 cursor-pointer py-1 text-[11px] font-semibold text-gray-700 dark:text-gray-300">
                          <input
                            type="radio"
                            name="smartwatch"
                            value={opt}
                            checked={cadForm.smartwatch === opt}
                            onChange={() => setCadForm({ ...cadForm, smartwatch: opt })}
                            className="w-3.5 h-3.5 text-sigma-600 focus:ring-sigma-500 border-gray-300 accent-sigma-600"
                          />
                          {opt}
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* CHIP / Operadora */}
                  <div>
                    <label className="block text-gray-400 font-bold mb-1 uppercase tracking-wider text-[9px]">
                      CHIP / Operadora
                    </label>
                    <select
                      value={cadForm.chip || ''}
                      onChange={e => setCadForm({ ...cadForm, chip: e.target.value })}
                      className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-850 border border-gray-200 dark:border-gray-750 rounded-xl text-xs focus:ring-2 focus:ring-sigma-500 focus:outline-none text-gray-750 dark:text-gray-200"
                    >
                      <option value="">Sem CHIP / Não se aplica</option>
                      {CHIPS_OPCOES.map(chipOpt => (
                        <option key={chipOpt} value={chipOpt}>{chipOpt}</option>
                      ))}
                    </select>
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
                  <div className="md:col-span-2">
                    <label className="block text-gray-400 font-bold mb-1.5 uppercase tracking-wider text-[9px]">
                      Local Externo à Unidade
                    </label>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 bg-gray-50/50 dark:bg-gray-850/50 p-3.5 border border-gray-200 dark:border-gray-750 rounded-xl">
                      <label className="flex items-center gap-1.5 cursor-pointer py-1 text-[11px] font-semibold text-gray-700 dark:text-gray-300">
                        <input
                          type="radio"
                          name="localExterno"
                          value=""
                          checked={!cadForm.localExterno}
                          onChange={() => setCadForm({ ...cadForm, localExterno: '' })}
                          className="w-3.5 h-3.5 text-sigma-600 focus:ring-sigma-500 border-gray-300 accent-sigma-600"
                        />
                        Não se aplica / Nenhum
                      </label>
                      {LOCAIS_EXTERNOS_OPCOES.map(opt => (
                        <label key={opt} className="flex items-center gap-1.5 cursor-pointer py-1 text-[11px] font-semibold text-gray-700 dark:text-gray-300">
                          <input
                            type="radio"
                            name="localExterno"
                            value={opt}
                            checked={cadForm.localExterno === opt}
                            onChange={() => setCadForm({ ...cadForm, localExterno: opt })}
                            className="w-3.5 h-3.5 text-sigma-600 focus:ring-sigma-500 border-gray-300 accent-sigma-600"
                          />
                          {opt}
                        </label>
                      ))}
                    </div>
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
                      Data Recebimento na AIP
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
