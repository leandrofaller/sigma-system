'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import dynamic from 'next/dynamic'
import { motion, AnimatePresence } from 'framer-motion'
import html2canvas from 'html2canvas'
import JSZip from 'jszip'
import {
  Map, Shield, Building2, Users, Search, Plus, Trash2, FileBarChart,
  Play, Pause, Download, Loader2, X, ChevronRight, Sparkles, MapPin, RefreshCw, Brain
} from 'lucide-react'
import { toast } from 'sonner'
import { containsNormalized } from '@/lib/search'
import { IBGE_PARA_NOME, nomeParaIbge } from '@/lib/municipios-rondonia'
import { inferMunicipioFromUnidadeAip } from '@/lib/unidades-enderecos-resolver'
import type { MunicipioMapStats } from './MapaFaccoesMap'

const MapaFaccoesMap = dynamic(() => import('./MapaFaccoesMap'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full text-subtle text-sm gap-2">
      <Loader2 className="w-5 h-5 animate-spin" /> Carregando mapa de Rondônia...
    </div>
  ),
})

interface SearchResult {
  source: 'AIP' | 'SIPE'
  aipApenadoId: string | null
  sipeId: number
  nome: string
  unidade: string | null
  faccao: string
  faccaoCor: string
  emAip: boolean
}

interface Vinculo {
  id: string
  municipio: string
  unidadePrisional: string
  observacoes: string | null
  origem?: string
  apenado: {
    id: string
    sipeId: number
    nome: string
    unidade: string | null
    faccaoDisplay: string
    faccaoCor: string
    vulgo: string | null
    photoPath?: string | null
  }
}

interface StatsPayload {
  municipios: MunicipioMapStats[]
  maxApenados: number
  totais: {
    vinculos: number
    municipiosComDados: number
    unidadesComDados: number
    manual?: number
    aipAuto?: number
  }
}

export interface PendingMapaLink {
  aipApenadoId: string
  nome: string
  unidade: string
  sipeId: number
}

interface MapaFaccoesClientProps {
  /** Renderizado dentro da aba AIP (sem header duplicado de página). */
  embedded?: boolean
  /** Destaca município do apenado AIP ao navegar da lista de apenados. */
  highlightAipApenadoId?: string | null
  onClearHighlight?: () => void
  /** Apenado aguardando vinculação — clique no município confirma. */
  pendingMapaLink?: PendingMapaLink | null
  onClearPendingMapaLink?: () => void
  onMapaLinked?: (aipApenadoId: string) => void
}

export function MapaFaccoesClient({
  embedded = false,
  highlightAipApenadoId = null,
  onClearHighlight,
  pendingMapaLink = null,
  onClearPendingMapaLink,
  onMapaLinked,
}: MapaFaccoesClientProps = {}) {
  const [geojson, setGeojson] = useState<GeoJSON.FeatureCollection | null>(null)
  const [stats, setStats] = useState<StatsPayload | null>(null)
  const [vinculos, setVinculos] = useState<Vinculo[]>([])
  const [unidades, setUnidades] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedIbge, setSelectedIbge] = useState<number | null>(null)
  const [selectedNome, setSelectedNome] = useState<string | null>(null)
  const [showCadastro, setShowCadastro] = useState(false)
  const [showRelatorio, setShowRelatorio] = useState(false)
  const [relatorio, setRelatorio] = useState<Record<string, unknown> | null>(null)
  const [presentationMode, setPresentationMode] = useState(false)
  const [presentationIndex, setPresentationIndex] = useState(0)
  const [presentationPlaying, setPresentationPlaying] = useState(false)
  const [exporting, setExporting] = useState(false)

  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [selectedApenado, setSelectedApenado] = useState<SearchResult | null>(null)
  const [unidadeInput, setUnidadeInput] = useState('')
  const [observacoes, setObservacoes] = useState('')
  const [saving, setSaving] = useState(false)
  const [syncingAip, setSyncingAip] = useState(false)
  const [linkingMapa, setLinkingMapa] = useState(false)
  const [loadingVinculos, setLoadingVinculos] = useState(false)
  const [filtroLocalVinculos, setFiltroLocalVinculos] = useState('')

  const mapAreaRef = useRef<HTMLDivElement>(null)
  const presentationTimer = useRef<ReturnType<typeof setInterval> | null>(null)

  const statsByIbge = useMemo(() => {
    const m: Record<number, MunicipioMapStats> = {}
    for (const s of stats?.municipios ?? []) {
      if (s.ibge) m[s.ibge] = s
    }
    return m
  }, [stats])

  const statsByNome = useMemo(() => {
    const m: Record<string, MunicipioMapStats> = {}
    for (const s of stats?.municipios ?? []) m[s.nome] = s
    return m
  }, [stats])

  const municipiosComDados = useMemo(
    () => (stats?.municipios ?? []).filter((m) => m.totalApenados > 0),
    [stats]
  )

  const vinculosExibidos = useMemo(() => {
    const q = filtroLocalVinculos.trim()
    if (!q) return vinculos
    return vinculos.filter((v) =>
      containsNormalized(`${v.apenado.nome} ${v.apenado.vulgo ?? ''} ${v.apenado.sipeId} ${v.unidadePrisional} ${v.apenado.faccaoDisplay}`, q)
    )
  }, [vinculos, filtroLocalVinculos])

  const highlightIbge = presentationMode && municipiosComDados.length > 0
    ? municipiosComDados[presentationIndex % municipiosComDados.length]?.ibge ?? null
    : null

  const loadData = useCallback(async () => {
    try {
      const [geoRes, statsRes, unidRes] = await Promise.all([
        fetch('/geo/rondonia-municipios.geojson'),
        fetch('/api/mapa-faccoes/stats'),
        fetch('/api/mapa-faccoes/unidades'),
      ])
      if (geoRes.ok) setGeojson(await geoRes.json())
      if (statsRes.ok) setStats(await statsRes.json())
      if (unidRes.ok) {
        const d = await unidRes.json()
        setUnidades(d.unidades || [])
      }
    } catch (e) {
      console.error(e)
      toast.error('Erro ao carregar dados do mapa')
    } finally {
      setLoading(false)
    }
  }, [])

  const loadVinculos = useCallback(async (municipio: string, ibge: number | null) => {
    setLoadingVinculos(true)
    try {
      const params = new URLSearchParams({ municipio })
      if (ibge) params.set('ibge', String(ibge))
      const res = await fetch(`/api/mapa-faccoes/vinculos?${params}`)
      if (res.ok) {
        const d = await res.json()
        setVinculos(d.vinculos || [])
      } else {
        setVinculos([])
      }
    } finally {
      setLoadingVinculos(false)
    }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  useEffect(() => {
    if (selectedNome) {
      setFiltroLocalVinculos('')
      loadVinculos(selectedNome, selectedIbge)
    } else {
      setVinculos([])
    }
  }, [selectedNome, selectedIbge, loadVinculos])

  const focusAipApenadoOnMap = useCallback(async (aipId: string) => {
    const res = await fetch(`/api/mapa-faccoes/vinculos?municipio=`)
    if (!res.ok) return
    const data = await res.json()
    const match = (data.vinculos as Vinculo[]).find((v) => v.apenado.id === aipId)
    if (!match) {
      await fetch('/api/mapa-faccoes/sync-aip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aipApenadoId: aipId }),
      })
      await loadData()
      const retry = await fetch('/api/mapa-faccoes/vinculos')
      if (retry.ok) {
        const d2 = await retry.json()
        const m2 = (d2.vinculos as Vinculo[]).find((v) => v.apenado.id === aipId)
        if (m2) {
          setSelectedNome(m2.municipio)
          setSelectedIbge(nomeParaIbge(m2.municipio))
          return
        }
      }
      toast.info('Apenado sem município/unidade/facção suficientes para o mapa. Vincule manualmente.')
      return
    }
    setSelectedNome(match.municipio)
    setSelectedIbge(nomeParaIbge(match.municipio))
  }, [loadData])

  useEffect(() => {
    if (!highlightAipApenadoId || loading) return
    focusAipApenadoOnMap(highlightAipApenadoId).finally(() => onClearHighlight?.())
  }, [highlightAipApenadoId, loading, focusAipApenadoOnMap, onClearHighlight])

  const municipioSugerido = useMemo(
    () => (pendingMapaLink ? inferMunicipioFromUnidadeAip(pendingMapaLink.unidade) : null),
    [pendingMapaLink]
  )

  useEffect(() => {
    if (!pendingMapaLink) return
    if (municipioSugerido) {
      setSelectedNome(municipioSugerido)
      setSelectedIbge(nomeParaIbge(municipioSugerido))
    } else {
      setSelectedNome(null)
      setSelectedIbge(null)
    }
  }, [pendingMapaLink, municipioSugerido])

  const syncAllFromAip = async () => {
    setSyncingAip(true)
    let cursor: string | null = null
    let totalSynced = 0
    let totalProcessed = 0
    try {
      do {
        const res: Response = await fetch('/api/mapa-faccoes/sync-aip', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cursor, limit: 200 }),
        })
        const data: {
          error?: string
          synced?: number
          processed?: number
          nextCursor?: string | null
        } = await res.json()
        if (!res.ok) throw new Error(data.error || 'Falha na sincronização')
        totalSynced += data.synced ?? 0
        totalProcessed += data.processed ?? 0
        cursor = data.nextCursor ?? null
      } while (cursor)
      toast.success(`AIP sincronizado: ${totalSynced} vínculos de ${totalProcessed} apenados processados`)
      await loadData()
      if (selectedNome) await loadVinculos(selectedNome, selectedIbge)
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erro ao sincronizar com AIP')
    } finally {
      setSyncingAip(false)
    }
  }

  useEffect(() => {
    if (!presentationPlaying || !presentationMode || municipiosComDados.length === 0) {
      if (presentationTimer.current) clearInterval(presentationTimer.current)
      return
    }
    presentationTimer.current = setInterval(() => {
      setPresentationIndex((i) => (i + 1) % municipiosComDados.length)
    }, 3500)
    return () => {
      if (presentationTimer.current) clearInterval(presentationTimer.current)
    }
  }, [presentationPlaying, presentationMode, municipiosComDados.length])

  const linkPendingToMunicipio = useCallback(async (municipio: string, ibge: number | null) => {
    if (!pendingMapaLink || linkingMapa) return
    setLinkingMapa(true)
    try {
      const res = await fetch('/api/mapa-faccoes/vinculos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          municipio,
          municipioIbge: ibge,
          unidadePrisional: pendingMapaLink.unidade,
          aipApenadoId: pendingMapaLink.aipApenadoId,
          sipeId: pendingMapaLink.sipeId,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        if (data.duplicate) toast.warning('Este apenado já está vinculado a este município')
        else toast.error(data.error || 'Erro ao vincular')
        return
      }
      toast.success(`${pendingMapaLink.nome} vinculado a ${municipio}`)
      onMapaLinked?.(pendingMapaLink.aipApenadoId)
      onClearPendingMapaLink?.()
      await loadData()
      await loadVinculos(municipio, ibge)
    } finally {
      setLinkingMapa(false)
    }
  }, [pendingMapaLink, linkingMapa, loadData, loadVinculos, onMapaLinked, onClearPendingMapaLink])

  const handleSelectMunicipio = (ibge: number, nome: string) => {
    if (pendingMapaLink) {
      setSelectedIbge(ibge)
      setSelectedNome(nome)
      void linkPendingToMunicipio(nome, ibge)
      return
    }

    setSelectedIbge(ibge)
    setSelectedNome(nome)
    if (presentationMode) {
      const idx = municipiosComDados.findIndex((m) => m.ibge === ibge)
      if (idx >= 0) setPresentationIndex(idx)
    }
  }

  const handleSearch = async () => {
    const q = searchQuery.trim()
    if (!q) return
    setSearching(true)
    try {
      const isSipeId = /^\d+$/.test(q)
      const url = isSipeId
        ? `/api/mapa-faccoes/search?sipeId=${q}`
        : `/api/mapa-faccoes/search?q=${encodeURIComponent(q)}`
      const res = await fetch(url)
      if (res.ok) {
        const d = await res.json()
        setSearchResults(d.results || [])
      }
    } finally {
      setSearching(false)
    }
  }

  const handleSaveVinculo = async () => {
    if (!selectedNome || !selectedApenado || !unidadeInput.trim()) {
      toast.error('Selecione apenado e unidade prisional')
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/mapa-faccoes/vinculos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          municipio: selectedNome,
          municipioIbge: selectedIbge,
          unidadePrisional: unidadeInput.trim(),
          aipApenadoId: selectedApenado.aipApenadoId,
          sipeId: selectedApenado.sipeId,
          observacoes,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        if (data.duplicate) toast.warning('Este vínculo já existe no mapa')
        else toast.error(data.error || 'Erro ao salvar')
        return
      }
      if (data.createdAip) toast.success('Apenado importado do SIPE para AIP e vinculado ao mapa')
      else toast.success('Vínculo cadastrado no mapa')
      setShowCadastro(false)
      setSelectedApenado(null)
      setSearchQuery('')
      setSearchResults([])
      setUnidadeInput('')
      setObservacoes('')
      await loadData()
      if (selectedNome) await loadVinculos(selectedNome, selectedIbge)
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteVinculo = async (id: string) => {
    if (!confirm('Remover este vínculo do mapa? (O apenado permanece no AIP/SIAIP)')) return
    const res = await fetch(`/api/mapa-faccoes/vinculos/${id}`, { method: 'DELETE' })
    if (res.ok) {
      toast.success('Vínculo removido')
      await loadData()
      if (selectedNome) await loadVinculos(selectedNome, selectedIbge)
    }
  }

  const openRelatorio = async () => {
    setShowRelatorio(true)
    const res = await fetch('/api/mapa-faccoes/relatorio')
    if (res.ok) setRelatorio(await res.json())
  }

  const exportPng = async () => {
    if (!mapAreaRef.current) return
    setExporting(true)
    try {
      const canvas = await html2canvas(mapAreaRef.current, {
        backgroundColor: '#0f172a',
        scale: 2,
        useCORS: true,
      })
      const link = document.createElement('a')
      link.download = `mapa-faccoes-ro-${Date.now()}.png`
      link.href = canvas.toDataURL('image/png')
      link.click()
      toast.success('Imagem exportada')
    } catch {
      toast.error('Falha na exportação')
    } finally {
      setExporting(false)
    }
  }

  const exportApresentacao = async () => {
    if (!mapAreaRef.current || municipiosComDados.length === 0) return
    setExporting(true)
    const zip = new JSZip()
    const wasPlaying = presentationPlaying
    setPresentationMode(true)
    setPresentationPlaying(false)

    try {
      for (let i = 0; i < Math.min(municipiosComDados.length, 12); i++) {
        setPresentationIndex(i)
        await new Promise((r) => setTimeout(r, 1400))
        const canvas = await html2canvas(mapAreaRef.current!, {
          backgroundColor: '#0f172a',
          scale: 1.5,
          useCORS: true,
        })
        const blob = await new Promise<Blob | null>((resolve) =>
          canvas.toBlob(resolve, 'image/png')
        )
        if (blob) {
          const m = municipiosComDados[i]
          const slug = (m.nome || `ibge-${m.ibge}`).replace(/[^a-z0-9]+/gi, '-').toLowerCase()
          zip.file(`${String(i + 1).padStart(2, '0')}-${slug}.png`, blob)
        }
      }
      const content = await zip.generateAsync({ type: 'blob' })
      const link = document.createElement('a')
      link.href = URL.createObjectURL(content)
      link.download = `apresentacao-faccoes-ro-${Date.now()}.zip`
      link.click()
      toast.success('Pacote de apresentação exportado (ZIP com frames)')
    } catch {
      toast.error('Falha ao gerar apresentação')
    } finally {
      setPresentationPlaying(wasPlaying)
      setExporting(false)
    }
  }

  const selectedStat = selectedIbge ? statsByIbge[selectedIbge] : null
  const filteredUnidades = unidadeInput
    ? unidades.filter((u) => containsNormalized(u, unidadeInput))
    : unidades.slice(0, 15)

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh] gap-3 text-subtle">
        <Loader2 className="w-6 h-6 animate-spin text-sigma-500" />
        Preparando mapa de inteligência...
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className={`${embedded ? 'px-0 py-2' : 'px-4 md:px-6 py-3.5'} border-b border-gray-200 dark:border-gray-700 shrink-0`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          {!embedded ? (
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gradient-to-br from-red-500/20 to-orange-500/20 rounded-xl">
                <Map className="w-5 h-5 text-red-500" />
              </div>
              <div>
                <h1 className="text-lg md:text-xl font-bold text-gray-900 dark:text-white">
                  Mapa Facções — Rondônia
                </h1>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Visualização geográfica da atuação faccionada no sistema prisional
                </p>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-xs text-subtle">
              <Brain className="w-4 h-4 text-purple-500" />
              <span>Integrado ao AIP — vínculos sincronizados automaticamente</span>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={syncAllFromAip}
              disabled={syncingAip}
              className="btn-secondary text-xs gap-1.5"
            >
              {syncingAip ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              Sync AIP
            </button>
            <button
              type="button"
              onClick={() => {
                setPresentationMode((p) => !p)
                setPresentationPlaying(false)
              }}
              className={`btn-secondary text-xs gap-1.5 ${presentationMode ? 'ring-2 ring-amber-400' : ''}`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              Apresentação
            </button>
            {presentationMode && (
              <button
                type="button"
                onClick={() => setPresentationPlaying((p) => !p)}
                className="btn-secondary text-xs gap-1.5"
              >
                {presentationPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                {presentationPlaying ? 'Pausar' : 'Animar'}
              </button>
            )}
            <button type="button" onClick={exportPng} disabled={exporting} className="btn-secondary text-xs gap-1.5">
              <Download className="w-3.5 h-3.5" /> PNG
            </button>
            <button type="button" onClick={exportApresentacao} disabled={exporting} className="btn-secondary text-xs gap-1.5">
              <Download className="w-3.5 h-3.5" /> ZIP Frames
            </button>
            <button type="button" onClick={openRelatorio} className="btn-primary text-xs gap-1.5">
              <FileBarChart className="w-3.5 h-3.5" /> Relatório
            </button>
          </div>
        </div>

        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mt-3">
            {[
              { icon: Users, label: 'Faccionados mapeados', value: stats.totais.vinculos, color: 'text-red-500' },
              { icon: Brain, label: 'Via AIP (auto)', value: stats.totais.aipAuto ?? 0, color: 'text-purple-500' },
              { icon: MapPin, label: 'Municípios', value: stats.totais.municipiosComDados, color: 'text-blue-500' },
              { icon: Building2, label: 'Unidades', value: stats.totais.unidadesComDados, color: 'text-amber-500' },
              { icon: Shield, label: 'Cobertura RO', value: `${Math.round((stats.totais.municipiosComDados / 52) * 100)}%`, color: 'text-emerald-500' },
            ].map((k) => (
              <div key={k.label} className="rounded-xl bg-gray-50 dark:bg-gray-900/60 border border-gray-200/80 dark:border-gray-700/80 px-3 py-2">
                <div className="flex items-center gap-2">
                  <k.icon className={`w-3.5 h-3.5 ${k.color}`} />
                  <span className="text-[10px] font-bold uppercase text-subtle tracking-wide">{k.label}</span>
                </div>
                <p className="text-lg font-black text-gray-900 dark:text-white mt-0.5">{k.value}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex-1 min-h-0 flex flex-col lg:flex-row gap-0 lg:gap-4 p-3 md:p-4">
        <div
          ref={mapAreaRef}
          className="relative flex-1 min-h-[320px] lg:min-h-0 rounded-2xl overflow-hidden border border-gray-200 dark:border-gray-700 shadow-xl"
        >
          <MapaFaccoesMap
            geojson={geojson}
            municipios={stats?.municipios ?? []}
            statsByIbge={statsByIbge}
            statsByNome={statsByNome}
            maxApenados={stats?.maxApenados ?? 1}
            selectedIbge={selectedIbge}
            highlightIbge={highlightIbge}
            onSelect={handleSelectMunicipio}
            presentationMode={presentationMode}
            linkMode={!!pendingMapaLink}
          />

          {pendingMapaLink && (
            <div className="absolute top-3 right-3 z-[1000] max-w-sm bg-amber-500/95 text-amber-950 rounded-xl px-4 py-3 shadow-2xl border border-amber-300 animate-in fade-in slide-in-from-top-2">
              <p className="text-[10px] font-black uppercase tracking-wider">Vinculação rápida</p>
              <p className="font-bold text-sm mt-0.5 truncate">{pendingMapaLink.nome}</p>
              <p className="text-xs mt-1 opacity-90">
                {linkingMapa ? 'Salvando vínculo...' : 'Clique no município no mapa para confirmar'}
              </p>
              <button
                type="button"
                onClick={onClearPendingMapaLink}
                disabled={linkingMapa}
                className="mt-2 text-[10px] font-bold underline hover:no-underline disabled:opacity-50"
              >
                Cancelar
              </button>
            </div>
          )}

          {presentationMode && highlightIbge && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="absolute bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-80 bg-gray-950/90 backdrop-blur-md border border-white/10 rounded-2xl p-4 text-white shadow-2xl z-[1000]"
            >
              <p className="text-[10px] uppercase tracking-widest text-amber-400 font-bold mb-1">Modo apresentação</p>
              <h3 className="text-xl font-black">{IBGE_PARA_NOME[highlightIbge]}</h3>
              {statsByIbge[highlightIbge] && (
                <p className="text-sm text-gray-300 mt-1">
                  {statsByIbge[highlightIbge].totalApenados} faccionados ·{' '}
                  <span style={{ color: statsByIbge[highlightIbge].faccaoCor }}>
                    {statsByIbge[highlightIbge].faccaoPredominante}
                  </span>
                </p>
              )}
            </motion.div>
          )}

          <div className="absolute top-3 left-3 z-[1000] bg-gray-950/80 backdrop-blur rounded-lg px-3 py-2 text-[10px] text-gray-300 border border-white/10 max-w-[200px]">
            <p className="font-bold text-white mb-1.5">Legenda</p>
            <p className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-sm bg-[#dc2626]" /> Comando Vermelho</p>
            <p className="flex items-center gap-1.5 mt-0.5">
              <span
                className="inline-block w-3 h-3 rounded-sm border border-white/20"
                style={{ background: 'repeating-linear-gradient(45deg,#0a0a0a,#0a0a0a 2px,#f8fafc 2px,#f8fafc 4px)' }}
              />
              PCC (listrado)
            </p>
            <p className="mt-0.5 text-gray-400">Divisão = CV e PCC no mesmo município</p>
            <p className={`mt-1.5 ${pendingMapaLink ? 'text-amber-300 font-bold' : 'text-amber-400'}`}>
              {pendingMapaLink ? 'Modo vínculo: clique no município' : 'Clique no município para cadastrar'}
            </p>
          </div>
        </div>

        <div className="w-full lg:w-[360px] shrink-0 flex flex-col min-h-[280px] lg:min-h-0 bg-white dark:bg-gray-900/50 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          {pendingMapaLink ? (
            <div className="flex flex-col flex-1 p-4">
              <div className="rounded-2xl border-2 border-dashed border-amber-400 bg-amber-50 dark:bg-amber-950/20 p-4">
                <p className="text-[10px] font-black uppercase tracking-wider text-amber-600 dark:text-amber-400">
                  Vincular ao mapa
                </p>
                <p className="font-black text-base text-gray-900 dark:text-white mt-1">{pendingMapaLink.nome}</p>
                <p className="text-[10px] text-subtle mt-0.5">SIPE #{pendingMapaLink.sipeId}</p>
                <p className="text-xs mt-2 flex items-center gap-1.5 text-gray-700 dark:text-gray-300">
                  <Building2 className="w-3.5 h-3.5 shrink-0" />
                  {pendingMapaLink.unidade}
                </p>
                <p className="text-sm mt-4 text-amber-900 dark:text-amber-100 leading-relaxed">
                  {municipioSugerido
                    ? <>Município sugerido pela unidade: <strong>{municipioSugerido}</strong>. Clique nele no mapa para confirmar ou escolha outro.</>
                    : 'Selecione o município no mapa ao lado. O vínculo será criado automaticamente.'}
                </p>
                {linkingMapa && (
                  <p className="text-xs mt-3 flex items-center gap-2 text-amber-700 dark:text-amber-300">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Salvando...
                  </p>
                )}
                <button
                  type="button"
                  onClick={onClearPendingMapaLink}
                  disabled={linkingMapa}
                  className="btn-secondary w-full mt-4 text-xs disabled:opacity-50"
                >
                  Cancelar
                </button>
              </div>
            </div>
          ) : selectedNome ? (
            <>
              <div className="p-4 border-b border-gray-200 dark:border-gray-700">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-[10px] font-bold uppercase text-subtle tracking-wider">Município selecionado</p>
                    <h2 className="text-lg font-black text-gray-900 dark:text-white">{selectedNome}</h2>
                    {selectedStat && (
                      <div className="flex flex-wrap gap-2 mt-2">
                        <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/10 text-red-600 dark:text-red-400 font-bold">
                          {selectedStat.totalApenados} faccionados
                        </span>
                        <span
                          className="text-xs px-2 py-0.5 rounded-full font-bold"
                          style={{ backgroundColor: `${selectedStat.faccaoCor}22`, color: selectedStat.faccaoCor }}
                        >
                          {selectedStat.faccaoPredominante}
                        </span>
                        {selectedStat.estiloMapa?.tipo === 'split' && selectedStat.faccaoSecundaria && (
                          <span className="text-xs px-2 py-0.5 rounded-full font-bold bg-gray-800 text-gray-200">
                            + {selectedStat.faccaoSecundaria} ({selectedStat.estiloMapa.pccCount} PCC / {selectedStat.estiloMapa.cvCount} CV)
                          </span>
                        )}
                        {selectedStat.estiloMapa?.tipo === 'striped' && (
                          <span
                            className="text-xs px-2 py-0.5 rounded-full font-bold text-white"
                            style={{ background: 'repeating-linear-gradient(45deg,#0a0a0a,#0a0a0a 3px,#f8fafc 3px,#f8fafc 6px)' }}
                          >
                            Listrado PCC
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  <button type="button" onClick={() => { setSelectedIbge(null); setSelectedNome(null) }} className="p-1 text-subtle hover:text-gray-900 dark:hover:text-white">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => setShowCadastro(true)}
                  className="btn-primary w-full mt-3 text-sm gap-2"
                >
                  <Plus className="w-4 h-4" /> Vincular apenado + unidade
                </button>
              </div>

              <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-700 shrink-0">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-subtle pointer-events-none" />
                  <input
                    type="text"
                    value={filtroLocalVinculos}
                    onChange={(e) => setFiltroLocalVinculos(e.target.value)}
                    placeholder="Filtrar apenado, SIPE, unidade..."
                    className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/80"
                  />
                </div>
                <p className="text-[10px] text-subtle mt-1.5 font-medium">
                  {loadingVinculos
                    ? 'Carregando faccionados...'
                    : `${vinculosExibidos.length} de ${vinculos.length} vinculado${vinculos.length !== 1 ? 's' : ''}`}
                </p>
              </div>

              <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {loadingVinculos ? (
                  <div className="flex flex-col items-center justify-center py-12 text-subtle gap-2">
                    <Loader2 className="w-6 h-6 animate-spin" />
                    <p className="text-xs">Buscando apenados vinculados...</p>
                  </div>
                ) : vinculos.length === 0 ? (
                  <p className="text-sm text-subtle text-center py-8">
                    Nenhum vínculo listado para este município.
                    {selectedStat && selectedStat.totalApenados > 0
                      ? ' Os dados do mapa podem usar nome diferente — tente sincronizar novamente com Sync AIP.'
                      : ' Clique em "Vincular" para cadastrar.'}
                  </p>
                ) : vinculosExibidos.length === 0 ? (
                  <p className="text-sm text-subtle text-center py-8">Nenhum apenado corresponde ao filtro.</p>
                ) : (
                  vinculosExibidos.map((v) => (
                    <div
                      key={v.id}
                      className="rounded-xl border border-gray-200 dark:border-gray-700 p-3 hover:border-sigma-400/50 hover:shadow-sm transition-all bg-white dark:bg-gray-800/40"
                    >
                      <div className="flex gap-3">
                        <div className="w-11 h-11 rounded-xl overflow-hidden bg-gray-200 dark:bg-gray-700 shrink-0 flex items-center justify-center text-sm font-bold text-gray-500">
                          {v.apenado.photoPath ? (
                            <img
                              src={`/api/aip/apenados/${v.apenado.id}/foto`}
                              alt=""
                              className="w-full h-full object-cover"
                              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                            />
                          ) : (
                            <Users className="w-5 h-5 opacity-40" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between gap-2 items-start">
                            <div className="min-w-0">
                              <p className="font-bold text-sm text-gray-900 dark:text-white leading-tight">{v.apenado.nome}</p>
                              {v.apenado.vulgo && (
                                <p className="text-[10px] text-subtle italic truncate">&quot;{v.apenado.vulgo}&quot;</p>
                              )}
                              <p className="text-[10px] text-subtle font-mono mt-0.5">SIPE #{v.apenado.sipeId}</p>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleDeleteVinculo(v.id)}
                              className="text-red-500 hover:bg-red-500/10 p-1.5 rounded-lg shrink-0"
                              title="Remover vínculo do mapa"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                          <p className="text-xs mt-1.5 flex items-start gap-1 text-gray-600 dark:text-gray-300">
                            <Building2 className="w-3 h-3 shrink-0 mt-0.5" />
                            <span className="line-clamp-2">{v.unidadePrisional}</span>
                          </p>
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            <span
                              className="inline-block text-[10px] font-bold px-1.5 py-0.5 rounded"
                              style={{ backgroundColor: `${v.apenado.faccaoCor}22`, color: v.apenado.faccaoCor }}
                            >
                              {v.apenado.faccaoDisplay}
                            </span>
                            {v.origem === 'AIP_AUTO' && (
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-600 dark:text-purple-400">
                                AIP
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center flex-1 p-6 text-center">
              <MapPin className="w-10 h-10 text-sigma-500/40 mb-3" />
              <p className="text-sm font-bold text-gray-700 dark:text-gray-300">Selecione um município no mapa</p>
              <p className="text-xs text-subtle mt-2 max-w-[240px]">
                Clique em qualquer município de Rondônia para visualizar faccionados e cadastrar vínculos com unidades prisionais.
              </p>
            </div>
          )}
        </div>
      </div>

      <AnimatePresence>
        {showCadastro && selectedNome && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowCadastro(false)}
          >
            <motion.div
              initial={{ scale: 0.95, y: 10 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95 }}
              className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto border border-gray-200 dark:border-gray-700"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-5 border-b border-gray-200 dark:border-gray-700">
                <h3 className="text-lg font-black">Vincular ao mapa</h3>
                <p className="text-sm text-subtle mt-1">
                  {selectedNome} — busque por nome ou SIPE ID (sem duplicar dados; referência AIP/SIAIP)
                </p>
              </div>
              <div className="p-5 space-y-4">
                <div>
                  <label className="text-xs font-bold uppercase text-subtle">Buscar apenado</label>
                  <div className="flex gap-2 mt-1">
                    <input
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                      placeholder="Nome, CPF ou SIPE ID..."
                      className="input-base flex-1"
                    />
                    <button type="button" onClick={handleSearch} disabled={searching} className="btn-primary px-3">
                      {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                    </button>
                  </div>
                  {searchResults.length > 0 && (
                    <div className="mt-2 max-h-40 overflow-y-auto rounded-xl border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-800">
                      {searchResults.map((r) => (
                        <button
                          key={`${r.source}-${r.sipeId}`}
                          type="button"
                          onClick={() => {
                            setSelectedApenado(r)
                            if (r.unidade) setUnidadeInput(r.unidade)
                          }}
                          className={`w-full text-left px-3 py-2 text-sm hover:bg-sigma-500/5 ${selectedApenado?.sipeId === r.sipeId ? 'bg-sigma-500/10' : ''}`}
                        >
                          <span className="font-bold">{r.nome}</span>
                          <span className="text-[10px] ml-2 text-subtle">#{r.sipeId} · {r.source}</span>
                          {!r.emAip && <span className="text-[10px] ml-1 text-amber-600">(importará para AIP)</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {selectedApenado && (
                  <div className="rounded-xl bg-gray-50 dark:bg-gray-800/50 p-3 text-sm">
                    <p className="font-bold">{selectedApenado.nome}</p>
                    <p className="text-subtle text-xs">SIPE {selectedApenado.sipeId} · {selectedApenado.faccao}</p>
                  </div>
                )}

                <div>
                  <label className="text-xs font-bold uppercase text-subtle">Unidade prisional</label>
                  <input
                    list="unidades-map"
                    value={unidadeInput}
                    onChange={(e) => setUnidadeInput(e.target.value)}
                    placeholder="Ex.: Penitenciária..."
                    className="input-base w-full mt-1"
                  />
                  <datalist id="unidades-map">
                    {filteredUnidades.map((u) => (
                      <option key={u} value={u} />
                    ))}
                  </datalist>
                </div>

                <div>
                  <label className="text-xs font-bold uppercase text-subtle">Observações (opcional)</label>
                  <textarea
                    value={observacoes}
                    onChange={(e) => setObservacoes(e.target.value)}
                    rows={2}
                    className="input-base w-full mt-1"
                  />
                </div>

                <div className="flex gap-2 pt-2">
                  <button type="button" onClick={() => setShowCadastro(false)} className="btn-secondary flex-1">Cancelar</button>
                  <button type="button" onClick={handleSaveVinculo} disabled={saving} className="btn-primary flex-1 gap-2">
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <ChevronRight className="w-4 h-4" />}
                    Salvar vínculo
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showRelatorio && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowRelatorio(false)}
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto border border-gray-200 dark:border-gray-700"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-5 border-b flex justify-between items-center">
                <div>
                  <h3 className="text-lg font-black">Relatório executivo</h3>
                  <p className="text-xs text-subtle">Unidades com faccionados · quantitativos · facção predominante</p>
                </div>
                <button type="button" onClick={() => setShowRelatorio(false)}><X className="w-5 h-5" /></button>
              </div>
              {!relatorio ? (
                <div className="p-8 flex justify-center"><Loader2 className="w-6 h-6 animate-spin" /></div>
              ) : (
                <div className="p-5 space-y-6 text-sm">
                  <div className="grid grid-cols-2 gap-3">
                    {Object.entries((relatorio.resumo as Record<string, number>) || {}).map(([k, v]) => (
                      <div key={k} className="rounded-lg bg-gray-50 dark:bg-gray-800 p-3">
                        <p className="text-[10px] uppercase text-subtle font-bold">{k.replace(/([A-Z])/g, ' $1')}</p>
                        <p className="text-xl font-black">{v}</p>
                      </div>
                    ))}
                  </div>
                  <div>
                    <h4 className="font-bold mb-2">Top municípios</h4>
                    <div className="space-y-1">
                      {((relatorio.topMunicipios as MunicipioMapStats[]) || []).slice(0, 8).map((m) => (
                        <div key={m.nome} className="flex justify-between items-center py-1 border-b border-gray-100 dark:border-gray-800">
                          <span>{m.nome}</span>
                          <span className="font-bold" style={{ color: m.faccaoCor }}>{m.totalApenados} · {m.faccaoPredominante}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <h4 className="font-bold mb-2">Unidades com maior incidência</h4>
                    <div className="space-y-1">
                      {((relatorio.topUnidades as { unidade: string; municipio: string; total: number; faccaoPredominante: string }[]) || []).slice(0, 8).map((u) => (
                        <div key={`${u.unidade}-${u.municipio}`} className="flex justify-between py-1 border-b border-gray-100 dark:border-gray-800 text-xs">
                          <span className="truncate max-w-[60%]">{u.unidade} <span className="text-subtle">({u.municipio})</span></span>
                          <span className="font-bold">{u.total} · {u.faccaoPredominante}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => window.print()}
                    className="btn-primary w-full"
                  >
                    Imprimir / PDF
                  </button>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <style jsx global>{`
        .mapa-faccao-tooltip {
          background: rgba(15, 23, 42, 0.92) !important;
          border: 1px solid rgba(255,255,255,0.1) !important;
          color: #f8fafc !important;
          border-radius: 8px !important;
          font-size: 11px !important;
          padding: 6px 10px !important;
        }
        .leaflet-container {
          background: #0f172a;
          font-family: inherit;
        }
      `}</style>
    </div>
  )
}