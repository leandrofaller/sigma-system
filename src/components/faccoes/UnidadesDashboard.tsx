'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { 
  Building2, 
  Users, 
  Radio, 
  Activity, 
  TrendingUp, 
  PieChart as PieIcon, 
  AlertTriangle,
  Loader2
} from 'lucide-react'
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  Tooltip, 
  ResponsiveContainer, 
  PieChart, 
  Pie, 
  Cell, 
  Legend
} from 'recharts'
import { useTheme } from '@/components/providers/ThemeProvider'

interface StatsData {
  totalApenados: number
  totalMonitorados: number
  totalUnidadesCadastradas: number
  unidades: Array<{ nome: string; quantidade: number }>
  regimes: Array<{ nome: string; quantidade: number }>
  sexos: Array<{ nome: string; quantidade: number }>
}

interface UnidadesDashboardProps {
  endpoint?: string
}

export function UnidadesDashboard({ endpoint = '/api/sipe/unidades/stats' }: UnidadesDashboardProps) {
  const { theme } = useTheme()
  const isDark = theme === 'dark'
  
  const [data, setData] = useState<StatsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchStats() {
      setLoading(true)
      try {
        const res = await fetch(endpoint)
        if (!res.ok) throw new Error('Erro ao carregar estatísticas')
        const stats = await res.json()
        setData(stats)
      } catch (err: any) {
        console.error(err)
        setError(err.message || 'Falha na comunicação com o servidor')
      } finally {
        setLoading(false)
      }
    }
    fetchStats()
  }, [])

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center min-h-[300px] text-gray-400 gap-3">
        <Loader2 className="w-8 h-8 text-red-600 dark:text-red-400 animate-spin" />
        <p className="text-sm font-medium animate-pulse">Carregando painel analítico...</p>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center min-h-[300px] text-gray-400 gap-3 p-8">
        <AlertTriangle className="w-10 h-10 text-amber-500 animate-bounce" />
        <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">Não foi possível carregar o dashboard</p>
        <p className="text-xs text-gray-500 text-center max-w-xs">{error || 'Erro na resposta do servidor.'}</p>
      </div>
    )
  }

  // Estatísticas calculadas
  const mediaApenados = data.unidades.length > 0 
    ? Math.round(data.totalApenados / data.totalUnidadesCadastradas) 
    : 0

  // Cores do Tema para os Gráficos
  const gridColor = isDark ? '#374151' : '#f3f4f6'
  const tickColor = isDark ? '#9ca3af' : '#6b7280'
  const tooltipBg = isDark ? '#1f2937' : '#ffffff'
  const tooltipBorder = isDark ? '#4b5563' : '#e5e7eb'
  const textColor = isDark ? '#f3f4f6' : '#111827'

  // Cores modernas para o gráfico de Donut
  const COLORS = [
    '#6172f3', // Indigo
    '#10b981', // Emerald
    '#f59e0b', // Amber
    '#ef4444', // Red
    '#8b5cf6', // Violet
    '#ec4899', // Pink
    '#06b6d4', // Cyan
  ]

  // Top 7 Unidades para o BarChart horizontal (nomes muito longos podem ser encurtados ou formatados)
  const topUnidades = data.unidades
    .slice(0, 7)
    .map(u => ({
      ...u,
      // Encurta nomes muito longos de unidades para caber melhor no gráfico
      displayNome: u.nome.length > 35 ? u.nome.substring(0, 32) + '...' : u.nome
    }))

  // Formata os dados para o gráfico de regimes
  const regimesValidos = data.regimes.filter(r => r.quantidade > 0)

  // Variantes de animação com Framer Motion
  const containerVariants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1
      }
    }
  }

  const itemVariants = {
    hidden: { opacity: 0, y: 15 },
    show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 100 } }
  }

  return (
    <div className="flex-1 flex flex-col overflow-y-auto p-6 space-y-6">
      
      {/* Header do Dashboard */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-100 dark:border-gray-700/50 pb-4">
        <div>
          <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-red-600 dark:text-red-400" />
            Visão Geral das Unidades Prisionais
          </h2>
          <p className="text-xs text-gray-500 mt-1">
            Métricas consolidadas de apenados ativos e importados no sistema SIPE
          </p>
        </div>
        <div className="text-xs text-gray-400 bg-gray-50 dark:bg-gray-800/40 border border-gray-100 dark:border-gray-700/60 px-3 py-1.5 rounded-lg self-start">
          Total de Unidades Ativas: <strong>{data.unidades.length}</strong>
        </div>
      </div>

      <motion.div 
        variants={containerVariants}
        initial="hidden"
        animate="show"
        className="space-y-6"
      >
        {/* Grid de Kpis */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          
          {/* Card 1: Total Apenados */}
          <motion.div 
            variants={itemVariants}
            className="bg-white dark:bg-gray-800 p-5 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm hover:shadow-md hover:border-gray-300 dark:hover:border-gray-600 transition-all group flex items-center justify-between"
          >
            <div className="space-y-1">
              <span className="text-[10px] uppercase font-bold tracking-wider text-gray-400 dark:text-gray-500">
                População Total
              </span>
              <h3 className="text-2xl font-bold text-gray-900 dark:text-white tracking-tight">
                {data.totalApenados.toLocaleString('pt-BR')}
              </h3>
              <p className="text-[10px] text-gray-500">Apenados integrados</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-red-50 dark:bg-red-950/20 text-red-600 dark:text-red-400 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
              <Users className="w-6 h-6" />
            </div>
          </motion.div>

          {/* Card 2: Unidades Cadastradas */}
          <motion.div 
            variants={itemVariants}
            className="bg-white dark:bg-gray-800 p-5 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm hover:shadow-md hover:border-gray-300 dark:hover:border-gray-600 transition-all group flex items-center justify-between"
          >
            <div className="space-y-1">
              <span className="text-[10px] uppercase font-bold tracking-wider text-gray-400 dark:text-gray-500">
                Unidades do SIPE
              </span>
              <h3 className="text-2xl font-bold text-gray-900 dark:text-white tracking-tight">
                {data.totalUnidadesCadastradas}
              </h3>
              <p className="text-[10px] text-gray-500">Unidades mapeadas</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-indigo-50 dark:bg-indigo-950/20 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
              <Building2 className="w-6 h-6" />
            </div>
          </motion.div>

          {/* Card 3: Monitorados */}
          <motion.div 
            variants={itemVariants}
            className="bg-white dark:bg-gray-800 p-5 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm hover:shadow-md hover:border-gray-300 dark:hover:border-gray-600 transition-all group flex items-center justify-between"
          >
            <div className="space-y-1">
              <span className="text-[10px] uppercase font-bold tracking-wider text-gray-400 dark:text-gray-500">
                Tornozeleira
              </span>
              <h3 className="text-2xl font-bold text-gray-900 dark:text-white tracking-tight">
                {data.totalMonitorados.toLocaleString('pt-BR')}
              </h3>
              <p className="text-[10px] text-gray-500">Monitorados ativos</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
              <Radio className="w-6 h-6" />
            </div>
          </motion.div>

          {/* Card 4: Média por Unidade */}
          <motion.div 
            variants={itemVariants}
            className="bg-white dark:bg-gray-800 p-5 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm hover:shadow-md hover:border-gray-300 dark:hover:border-gray-600 transition-all group flex items-center justify-between"
          >
            <div className="space-y-1">
              <span className="text-[10px] uppercase font-bold tracking-wider text-gray-400 dark:text-gray-500">
                Média por Unidade
              </span>
              <h3 className="text-2xl font-bold text-gray-900 dark:text-white tracking-tight">
                {mediaApenados}
              </h3>
              <p className="text-[10px] text-gray-500">Internos / unidade</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-amber-50 dark:bg-amber-950/20 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
              <Activity className="w-6 h-6" />
            </div>
          </motion.div>
        </div>

        {/* Seção de Gráficos */}
        <motion.div 
          variants={itemVariants}
          className="grid grid-cols-1 xl:grid-cols-2 gap-6"
        >
          
          {/* Gráfico 1: População por Unidade (BarChart horizontal) */}
          <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm flex flex-col">
            <h3 className="text-xs font-bold text-gray-900 dark:text-white uppercase tracking-wider mb-4 flex items-center gap-1.5">
              <Building2 className="w-4 h-4 text-red-500" />
              População por Unidade (Top 7)
            </h3>
            
            <div className="flex-1 min-h-[300px]">
              <ResponsiveContainer width="100%" height={300}>
                <BarChart
                  data={topUnidades}
                  layout="vertical"
                  margin={{ top: 5, right: 30, left: 10, bottom: 5 }}
                >
                  <XAxis 
                    type="number" 
                    tick={{ fontSize: 10, fill: tickColor }} 
                    axisLine={false} 
                    tickLine={false} 
                  />
                  <YAxis 
                    type="category" 
                    dataKey="displayNome" 
                    tick={{ fontSize: 9, fill: tickColor, width: 140 }} 
                    axisLine={false} 
                    tickLine={false}
                    width={140}
                  />
                  <Tooltip
                    contentStyle={{
                      background: tooltipBg,
                      border: `1px solid ${tooltipBorder}`,
                      borderRadius: '12px',
                      boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                      fontSize: '11px',
                      color: textColor
                    }}
                    labelStyle={{ fontWeight: 600, color: textColor }}
                    itemStyle={{ color: '#ef4444' }}
                    formatter={(value) => [`${value} apenados`, 'População']}
                  />
                  <Bar 
                    dataKey="quantidade" 
                    fill="#ef4444" 
                    radius={[0, 4, 4, 0]} 
                    barSize={16} 
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Gráfico 2: Distribuição por Regime (Donut Chart) */}
          <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm flex flex-col">
            <h3 className="text-xs font-bold text-gray-900 dark:text-white uppercase tracking-wider mb-4 flex items-center gap-1.5">
              <PieIcon className="w-4 h-4 text-indigo-500" />
              Distribuição por Regime de Pena
            </h3>
            
            {regimesValidos.length === 0 ? (
              <div className="flex-1 flex items-center justify-center text-gray-400 text-xs">
                Nenhum regime de pena informado
              </div>
            ) : (
              <div className="flex-1 flex flex-col sm:flex-row items-center justify-center gap-6 min-h-[300px]">
                <div className="w-full sm:w-1/2 h-[220px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={regimesValidos}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={80}
                        paddingAngle={4}
                        dataKey="quantidade"
                        nameKey="nome"
                      >
                        {regimesValidos.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          background: tooltipBg,
                          border: `1px solid ${tooltipBorder}`,
                          borderRadius: '12px',
                          boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                          fontSize: '11px',
                          color: textColor
                        }}
                        itemStyle={{ color: textColor }}
                        formatter={(value) => [`${value} apenados`]}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                
                {/* Legenda Lateral Customizada para melhor controle de espaço */}
                <div className="w-full sm:w-1/2 space-y-2.5 max-h-[220px] overflow-y-auto pr-2">
                  {regimesValidos.map((item, index) => {
                    const percent = ((item.quantidade / data.totalApenados) * 100).toFixed(1)
                    return (
                      <div key={item.nome} className="flex items-start justify-between text-xs gap-3">
                        <div className="flex items-center gap-2 min-w-0">
                          <span 
                            className="w-3 h-3 rounded-full shrink-0" 
                            style={{ backgroundColor: COLORS[index % COLORS.length] }}
                          />
                          <span className="text-gray-700 dark:text-gray-300 font-medium truncate">
                            {item.nome}
                          </span>
                        </div>
                        <span className="text-gray-500 dark:text-gray-400 font-mono shrink-0">
                          {item.quantidade} ({percent}%)
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </motion.div>
        
      </motion.div>
    </div>
  )
}
