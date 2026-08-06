'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import dynamic from 'next/dynamic'
import { motion, AnimatePresence } from 'framer-motion'
import html2canvas from 'html2canvas'
import {
  Map as MapIcon,
  Building2,
  Users,
  Loader2,
  Download,
  X,
  ChevronRight,
  TrendingUp,
  Info
} from 'lucide-react'
import { toast } from 'sonner'
import type { MunicipioUnidadesStats } from './UnidadesMapa'

const UnidadesMapa = dynamic(() => import('./UnidadesMapa'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full text-gray-400 text-sm gap-2">
      <Loader2 className="w-5 h-5 animate-spin" /> Carregando mapa de Rondônia...
    </div>
  ),
})

interface StatsPayload {
  municipios: MunicipioUnidadesStats[]
  maxApenados: number
  totalApenadosEstado: number
  totalUnidadesEstado: number
}

export function UnidadesMapaClient() {
  const [geojson, setGeojson] = useState<GeoJSON.FeatureCollection | null>(null)
  const [stats, setStats] = useState<StatsPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedIbge, setSelectedIbge] = useState<number | null>(null)
  const [selectedNome, setSelectedNome] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const [mapZoom, setMapZoom] = useState(7)
  const [lockZoom, setLockZoom] = useState(false)
  const mapAreaRef = useRef<HTMLDivElement>(null)

  const statsByIbge = useMemo(() => {
    const m: Record<number, MunicipioUnidadesStats> = {}
    for (const s of stats?.municipios ?? []) {
      if (s.ibge) m[s.ibge] = s
    }
    return m
  }, [stats?.municipios])

  const statsByNome = useMemo(() => {
    const m: Record<string, MunicipioUnidadesStats> = {}
    for (const s of stats?.municipios ?? []) {
      m[s.nome] = s
    }
    return m
  }, [stats?.municipios])

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [geoRes, statsRes] = await Promise.all([
        fetch('/geo/rondonia-municipios.geojson'),
        fetch('/api/sipe/unidades-prisionais/mapa'),
      ])
      if (geoRes.ok) setGeojson(await geoRes.json())
      if (statsRes.ok) setStats(await statsRes.json())
    } catch (e) {
      console.error(e)
      toast.error('Erro ao carregar dados do mapa')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleSelectMunicipio = (ibge: number, nome: string) => {
    setSelectedIbge(ibge)
    setSelectedNome(nome)
  }

  const selectedStat = useMemo(() => {
    if (selectedIbge) return statsByIbge[selectedIbge] ?? null
    if (selectedNome) return statsByNome[selectedNome] ?? null
    return null
  }, [selectedIbge, selectedNome, statsByIbge, statsByNome])

  const exportMapImage = async () => {
    if (!mapAreaRef.current) return
    setExporting(true)
    try {
      const canvas = await html2canvas(mapAreaRef.current, {
        backgroundColor: '#0f172a',
        scale: 2,
        useCORS: true,
      })
      canvas.toBlob((blob) => {
        if (blob) {
          const url = URL.createObjectURL(blob)
          const link = document.createElement('a')
          link.href = url
          link.download = `mapa-populacao-prisional-${Date.now()}.png`
          link.click()
          URL.revokeObjectURL(url)
          toast.success('Mapa exportado em PNG com sucesso!')
        }
      }, 'image/png')
    } catch (e) {
      console.error(e)
      toast.error('Falha na exportação da imagem')
    } finally {
      setExporting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[50vh] gap-3 text-gray-400">
        <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
        Carregando dados geográficos e população prisional...
      </div>
    )
  }

  return (
    <div className="flex flex-col lg:flex-row h-[calc(100vh-210px)] min-h-[450px] gap-6 overflow-hidden">
      {/* Container do Mapa */}
      <div className="flex-1 flex flex-col bg-gray-900 rounded-2xl border border-gray-800 overflow-hidden relative shadow-inner">
        {/* Cabeçalho de Controle e KPIs do Mapa */}
        <div className="absolute top-4 left-4 right-4 z-[500] flex flex-wrap items-center justify-between gap-3 pointer-events-none">
          {/* KPIs Consolidados (Flutuantes) */}
          <div className="flex gap-2 pointer-events-auto bg-gray-950/90 backdrop-blur-md border border-gray-800 p-2.5 rounded-xl shadow-lg">
            <div className="flex items-center gap-2 border-r border-gray-800 pr-3">
              <div className="p-1.5 bg-blue-950/50 text-blue-400 rounded-lg">
                <Users className="w-4 h-4" />
              </div>
              <div>
                <p className="text-[9px] uppercase font-bold text-gray-500 tracking-wider">Total de Custodiados</p>
                <p className="text-sm font-extrabold text-white">
                  {stats?.totalApenadosEstado.toLocaleString('pt-BR') || 0}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 pl-1">
              <div className="p-1.5 bg-indigo-950/50 text-indigo-400 rounded-lg">
                <Building2 className="w-4 h-4" />
              </div>
              <div>
                <p className="text-[9px] uppercase font-bold text-gray-500 tracking-wider">Unidades Mapeadas</p>
                <p className="text-sm font-extrabold text-white">
                  {stats?.totalUnidadesEstado || 0}
                </p>
              </div>
            </div>
          </div>

          {/* Ações */}
          <div className="flex items-center gap-3 pointer-events-auto">
            {/* Controle de Zoom Flutuante (Barra ajustável e Trava de Zoom) */}
            <div className="flex items-center gap-3 bg-gray-950/90 backdrop-blur-md rounded-xl px-3 py-2 border border-gray-800 text-xs shadow-md transition-all duration-300">
              <span className="text-[10px] uppercase font-bold text-gray-400">Zoom:</span>
              <input
                type="range"
                min="7"
                max="12"
                step="0.5"
                value={mapZoom}
                onChange={(e) => setMapZoom(parseFloat(e.target.value))}
                className="w-20 accent-blue-500 cursor-pointer h-1 rounded-lg bg-white/10 appearance-none"
              />
              <button
                type="button"
                onClick={() => setLockZoom(!lockZoom)}
                className={`px-2 py-1 rounded text-[10px] font-bold transition-colors ${
                  lockZoom 
                    ? 'bg-red-500/20 text-red-300 border border-red-500/40' 
                    : 'bg-white/5 text-gray-300 hover:bg-white/10 border border-white/10'
                }`}
              >
                {lockZoom ? '🔒 Travar Zoom' : '🔓 Zoom Livre'}
              </button>
            </div>

            <button
              onClick={exportMapImage}
              disabled={exporting}
              className="flex items-center gap-2 bg-gray-950/90 hover:bg-gray-800 text-gray-200 disabled:opacity-50 text-xs font-semibold py-2.5 px-4 rounded-xl border border-gray-800 shadow-md backdrop-blur-md transition-all active:scale-95"
            >
              {exporting ? (
                <Loader2 className="w-4 h-4 animate-spin text-blue-400" />
              ) : (
                <Download className="w-4 h-4 text-blue-400" />
              )}
              Exportar Imagem
            </button>
          </div>
        </div>

        {/* Área do Mapa Leaflet */}
        <div ref={mapAreaRef} className="flex-1 w-full h-full relative z-0">
          <UnidadesMapa
            geojson={geojson}
            municipios={stats?.municipios || []}
            statsByIbge={statsByIbge}
            statsByNome={statsByNome}
            maxApenados={stats?.maxApenados || 1}
            selectedIbge={selectedIbge}
            onSelect={handleSelectMunicipio}
            mapZoom={mapZoom}
            lockZoom={lockZoom}
            onZoomChange={setMapZoom}
          />
        </div>
      </div>

      {/* Painel Lateral de Detalhamento do Município */}
      <div className="w-full lg:w-96 flex flex-col bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden shrink-0 shadow-sm">
        <AnimatePresence mode="wait">
          {selectedStat ? (
            <motion.div
              key={selectedStat.nome}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
              className="flex flex-col h-full overflow-hidden"
            >
              {/* Header do Painel Lateral */}
              <div className="p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50 flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-black text-gray-900 dark:text-white flex items-center gap-2">
                    {selectedStat.nome}
                  </h3>
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider font-mono">
                    CÓDIGO IBGE: #{selectedStat.ibge}
                  </p>
                </div>
                <button
                  onClick={() => {
                    setSelectedIbge(null)
                    setSelectedNome(null)
                  }}
                  className="p-1 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Informações Rápidas / KPIs */}
              <div className="p-4 grid grid-cols-2 gap-3 border-b border-gray-200 dark:border-gray-700/50 bg-gray-50/30 dark:bg-gray-800/20">
                <div className="bg-blue-50/50 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900/30 p-3 rounded-xl">
                  <span className="text-[9px] uppercase font-bold text-blue-500 dark:text-blue-400 block tracking-wider">
                    Total Custodiados
                  </span>
                  <span className="text-2xl font-black text-blue-700 dark:text-blue-400">
                    {selectedStat.totalApenados}
                  </span>
                </div>
                <div className="bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/30 p-3 rounded-xl">
                  <span className="text-[9px] uppercase font-bold text-indigo-500 dark:text-indigo-400 block tracking-wider">
                    Unidades Ativas
                  </span>
                  <span className="text-2xl font-black text-indigo-700 dark:text-indigo-400">
                    {selectedStat.totalUnidades}
                  </span>
                </div>
              </div>

              {/* Lista de Unidades do Município */}
              <div className="flex-1 overflow-y-auto p-4 flex flex-col">
                <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3 flex items-center gap-1.5">
                  <Building2 className="w-4 h-4 text-blue-500" />
                  Estabelecimentos Prisionais
                </h4>

                <div className="space-y-2.5">
                  {selectedStat.unidades.map((unidade) => {
                    const pct = selectedStat.totalApenados > 0
                      ? ((unidade.quantidade / selectedStat.totalApenados) * 100).toFixed(1)
                      : '0.0'

                    return (
                      <div
                        key={unidade.nome}
                        className="p-3 bg-white dark:bg-gray-800/80 rounded-xl border border-gray-200 dark:border-gray-700/80 shadow-sm flex flex-col gap-2 hover:border-blue-300 dark:hover:border-blue-900/50 transition-all group"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-xs font-bold text-gray-800 dark:text-gray-200 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors leading-tight">
                            {unidade.nome}
                          </p>
                        </div>
                        
                        <div className="flex items-center justify-between text-[11px] text-gray-500">
                          <span className="flex items-center gap-1">
                            <Users className="w-3.5 h-3.5 text-gray-400" />
                            <strong>{unidade.quantidade}</strong> preso(s)
                          </span>
                          <span className="font-mono text-gray-400 dark:text-gray-500">
                            {pct}% do total
                          </span>
                        </div>

                        {/* Barra de Progresso visual */}
                        <div className="w-full bg-gray-100 dark:bg-gray-700 h-1.5 rounded-full overflow-hidden">
                          <div 
                            className="bg-blue-500 dark:bg-blue-600 h-full rounded-full transition-all duration-500" 
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="empty-state"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex-1 flex flex-col items-center justify-center p-8 text-center text-gray-400 gap-4"
            >
              <div className="w-16 h-16 rounded-2xl bg-blue-50 dark:bg-blue-950/20 text-blue-500 dark:text-blue-400 flex items-center justify-center shadow-sm">
                <MapIcon className="w-8 h-8" />
              </div>
              <div className="space-y-1 max-w-[240px]">
                <p className="text-sm font-bold text-gray-900 dark:text-white">Selecione um Município</p>
                <p className="text-xs text-gray-500 leading-normal">
                  Clique em qualquer município colorido no mapa para visualizar a sua população prisional e suas respectivas unidades prisionais cadastradas.
                </p>
              </div>

              <div className="w-full mt-4 p-3 bg-gray-50 dark:bg-gray-800/40 rounded-xl border border-gray-150 dark:border-gray-700/60 text-[10px] text-left text-gray-500 leading-normal flex items-start gap-2 max-w-[280px]">
                <Info className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
                <p>
                  As cores dos municípios representam a densidade de apenados. Municípios com cores mais fortes possuem maior quantidade de presos custodiados.
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
