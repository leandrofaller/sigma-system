'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { motion, AnimatePresence } from 'framer-motion'
import html2canvas from 'html2canvas'
import JSZip from 'jszip'
import {
  Map, Shield, Building2, Users, Search, Plus, Trash2, FileBarChart,
  Play, Pause, Download, Loader2, X, ChevronRight, Sparkles, MapPin, RefreshCw, Brain, List,
  ChevronDown, Image as ImageIcon,
} from 'lucide-react'
import { toast } from 'sonner'
import { containsNormalized } from '@/lib/search'
import {
  IBGE_PARA_NOME,
  nomeParaIbge,
  normalizeMunicipioNome,
  normalizeMunicipioKey,
} from '@/lib/municipios-rondonia'
import {
  inferMunicipioFromUnidadeAip,
  listaEnderecosHrefFromUnidadeAip,
} from '@/lib/unidades-enderecos-resolver'
import { UNIDADES_ENDERECOS_RO } from '@/lib/unidades-enderecos-ro'
import type { MunicipioMapStats } from './MapaFaccoesMap'
import type { ApenadosMunicipioUnidadesPrisionais } from '@/lib/unidades-prisionais-resumo'
import {
  aplicarFiltroFaccaoMunicipios,
  rankFaccoesGlobais,
  labelFaccaoFiltro,
  matchesFaccaoFiltro,
} from '@/lib/mapa-faccoes'

import { FaccaoMapaBadge, PccStripeSwatch } from './FaccaoMapaBadge'
import { MunicipioSpotlightPanel } from './MunicipioSpotlightPanel'
import { MapaFaccoesFilters } from './MapaFaccoesFilters'
import { MapaFaccoesRelatorioModal } from './MapaFaccoesRelatorioModal'

const MapaFaccoesMap = dynamic(() => import('./MapaFaccoesMap'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full text-subtle text-sm gap-2">
      <Loader2 className="w-5 h-5 animate-spin" /> Carregando mapa de Rondônia...
    </div>
  ),
})

type ExportImageFormat = 'png' | 'jpeg' | 'webp'

const EXPORT_FORMATS: Array<{
  id: ExportImageFormat
  label: string
  ext: string
  mime: string
  hint: string
}> = [
  { id: 'png', label: 'PNG', ext: 'png', mime: 'image/png', hint: 'Sem perda · ideal p/ slides' },
  { id: 'jpeg', label: 'JPG', ext: 'jpg', mime: 'image/jpeg', hint: 'Arquivo menor · fotos/docs' },
  { id: 'webp', label: 'WebP', ext: 'webp', mime: 'image/webp', hint: 'Melhor compressão web' },
]

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
  municipios: Array<MunicipioMapStats & {
    faccoes: Record<string, number>
    estiloMapa: NonNullable<MunicipioMapStats['estiloMapa']>
    totalUnidades?: number
    unidades?: string[]
  }>
  apenadosPorMunicipio?: ApenadosMunicipioUnidadesPrisionais[]
  maxApenados: number
  totais: {
    vinculos: number
    municipiosComDados: number
    unidadesComDados: number
    manual?: number
    aipAuto?: number
    faccoes?: Record<string, number>
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
  const [presentationMode, setPresentationMode] = useState(false)
  const [presentationIndex, setPresentationIndex] = useState(0)
  const [presentationPlaying, setPresentationPlaying] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [exportMenuOpen, setExportMenuOpen] = useState(false)
  const [exportFormat, setExportFormat] = useState<ExportImageFormat>('png')
  const exportMenuRef = useRef<HTMLDivElement>(null)
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
  /** Filtro de facção no mapa (CV/PCC/chave canônica) — só afeta visualização, não vínculos. */
  const [filtroFaccao, setFiltroFaccao] = useState<string | null>(null)
  const [soComAtuacao, setSoComAtuacao] = useState(false)

  const mapAreaRef = useRef<HTMLDivElement>(null)
  const presentationTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const deepLinkApplied = useRef(false)
  const searchParams = useSearchParams()

  useEffect(() => {
    if (deepLinkApplied.current || loading) return
    const munParam = searchParams.get('municipio')
    const ibgeParam = searchParams.get('ibge')
    if (!munParam && !ibgeParam) return

    deepLinkApplied.current = true
    const ibgeParsed = ibgeParam ? parseInt(ibgeParam, 10) : null
    const ibge = ibgeParsed != null && !isNaN(ibgeParsed)
      ? ibgeParsed
      : munParam
        ? nomeParaIbge(normalizeMunicipioNome(munParam))
        : null
    const nome = munParam
      ? normalizeMunicipioNome(munParam)
      : ibge
        ? IBGE_PARA_NOME[ibge] ?? null
        : null

    if (nome) {
      setSelectedNome(nome)
      setSelectedIbge(ibge)
    }
  }, [searchParams, loading])

  /** Ranking global de facções (chips de filtro) a partir dos totais da API. */
  const faccoesBandas = useMemo(
    () => rankFaccoesGlobais(stats?.totais?.faccoes ?? {}),
    [stats?.totais?.faccoes]
  )

  /**
   * Stats visuais do mapa (filtrados por facção). Fonte de verdade dos vínculos
   * permanece em `stats` / APIs — este recorte é apenas de apresentação.
   */
  const { municipiosMapa, maxApenadosMapa } = useMemo(() => {
    const base = stats?.municipios ?? []
    const { municipios, maxApenados } = aplicarFiltroFaccaoMunicipios(base, filtroFaccao)
    return { municipiosMapa: municipios, maxApenadosMapa: maxApenados }
  }, [stats?.municipios, filtroFaccao])

  const statsByIbge = useMemo(() => {
    const m: Record<number, MunicipioMapStats> = {}
    for (const s of municipiosMapa) {
      if (s.ibge) m[s.ibge] = s
    }
    return m
  }, [municipiosMapa])

  const statsByNome = useMemo(() => {
    const m: Record<string, MunicipioMapStats> = {}
    for (const s of municipiosMapa) m[s.nome] = s
    return m
  }, [municipiosMapa])

  const municipiosComDados = useMemo(
    () => municipiosMapa.filter((m) => m.totalApenados > 0),
    [municipiosMapa]
  )

  const totalIntegrantesFiltrado = useMemo(
    () => municipiosMapa.reduce((s, m) => s + m.totalApenados, 0),
    [municipiosMapa]
  )

  const filtroFaccaoLabel = useMemo(
    () => (filtroFaccao ? labelFaccaoFiltro(filtroFaccao, faccoesBandas) : null),
    [filtroFaccao, faccoesBandas]
  )

  const vinculosExibidos = useMemo(() => {
    let list = vinculos
    // Filtro visual de facção também refina a lista do município (sem alterar dados/API)
    if (filtroFaccao) {
      list = list.filter((v) => matchesFaccaoFiltro(v.apenado.faccaoDisplay, filtroFaccao))
    }
    const q = filtroLocalVinculos.trim()
    if (!q) return list
    return list.filter((v) =>
      containsNormalized(
        `${v.apenado.nome} ${v.apenado.vulgo ?? ''} ${v.apenado.sipeId} ${v.unidadePrisional} ${v.apenado.faccaoDisplay}`,
        q
      )
    )
  }, [vinculos, filtroLocalVinculos, filtroFaccao])

  const highlightIbge = presentationMode && municipiosComDados.length > 0
    ? municipiosComDados[presentationIndex % municipiosComDados.length]?.ibge ?? null
    : null

  /** Lookup de presos da aba Unidades Prisionais (não SIAIP/AIP faccionados). */
  const unidadesPrisionaisLookup = useMemo(() => {
    const byIbge: Record<number, ApenadosMunicipioUnidadesPrisionais> = {}
    const byKey: Record<string, ApenadosMunicipioUnidadesPrisionais> = {}
    for (const m of stats?.apenadosPorMunicipio ?? []) {
      if (m.municipioIbge != null) byIbge[m.municipioIbge] = m
      byKey[normalizeMunicipioKey(m.municipio)] = m
      byKey[normalizeMunicipioKey(normalizeMunicipioNome(m.municipio))] = m
    }
    return { byIbge, byKey }
  }, [stats?.apenadosPorMunicipio])

  const resolveUnidadesPrisionaisMunicipio = useCallback(
    (ibge: number | null | undefined, nome: string | null | undefined) => {
      if (ibge != null && unidadesPrisionaisLookup.byIbge[ibge]) {
        return unidadesPrisionaisLookup.byIbge[ibge]
      }
      if (nome) {
        const key = normalizeMunicipioKey(nome)
        const keyCanon = normalizeMunicipioKey(normalizeMunicipioNome(nome))
        return (
          unidadesPrisionaisLookup.byKey[key] ??
          unidadesPrisionaisLookup.byKey[keyCanon] ??
          null
        )
      }
      return null
    },
    [unidadesPrisionaisLookup]
  )

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

  // Ao mudar o filtro, reinicia o carrossel de apresentação no primeiro município com dados
  useEffect(() => {
    setPresentationIndex(0)
  }, [filtroFaccao, soComAtuacao])

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
    const unidadeValida = unidades.find(
      (u) => u.toLowerCase() === unidadeInput.trim().toLowerCase()
    )
    if (!unidadeValida) {
      toast.error('Unidade prisional inválida. Escolha uma opção do catálogo de endereços.')
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
          unidadePrisional: unidadeValida,
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

  const canvasToBlob = (
    canvas: HTMLCanvasElement,
    format: ExportImageFormat,
    quality = 0.92
  ): Promise<Blob | null> => {
    const meta = EXPORT_FORMATS.find((f) => f.id === format) ?? EXPORT_FORMATS[0]
    // JPEG/WebP não suportam transparência — fundo já é #0f172a no html2canvas
    return new Promise((resolve) => {
      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob)
            return
          }
          // Fallback: alguns browsers falham em webp/jpeg via toBlob
          try {
            const dataUrl = canvas.toDataURL(
              meta.mime,
              format === 'png' ? undefined : quality
            )
            const bin = atob(dataUrl.split(',')[1] ?? '')
            const bytes = new Uint8Array(bin.length)
            for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
            resolve(new Blob([bytes], { type: meta.mime }))
          } catch {
            resolve(null)
          }
        },
        meta.mime,
        format === 'png' ? undefined : quality
      )
    })
  }

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    link.click()
    URL.revokeObjectURL(url)
  }

  const buildExportFilename = (format: ExportImageFormat, kind: 'mapa' | 'frame', slug?: string) => {
    const ext = EXPORT_FORMATS.find((f) => f.id === format)?.ext ?? 'png'
    const stamp = Date.now()
    const faccao = filtroFaccao
      ? `-${(filtroFaccaoLabel ?? filtroFaccao).replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`
      : ''
    if (kind === 'frame' && slug) {
      return `${slug}${faccao}.${ext}`
    }
    return `mapa-faccoes-ro${faccao}-${stamp}.${ext}`
  }

  useEffect(() => {
    if (!exportMenuOpen) return
    const onDoc = (e: MouseEvent) => {
      if (!exportMenuRef.current?.contains(e.target as Node)) setExportMenuOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setExportMenuOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [exportMenuOpen])

  const exportMapImage = async (format: ExportImageFormat = exportFormat) => {
    if (!mapAreaRef.current) return
    setExporting(true)
    setExportMenuOpen(false)
    setExportFormat(format)
    try {
      const canvas = await html2canvas(mapAreaRef.current, {
        backgroundColor: '#0f172a',
        scale: 2,
        useCORS: true,
      })
      const blob = await canvasToBlob(canvas, format)
      if (!blob) throw new Error('Blob vazio')
      const meta = EXPORT_FORMATS.find((f) => f.id === format)!
      downloadBlob(blob, buildExportFilename(format, 'mapa'))
      toast.success(`Mapa exportado em ${meta.label}`)
    } catch {
      toast.error('Falha na exportação da imagem')
    } finally {
      setExporting(false)
    }
  }

  const exportApresentacao = async (format: ExportImageFormat = exportFormat) => {
    if (!mapAreaRef.current || municipiosComDados.length === 0) return
    setExporting(true)
    setExportMenuOpen(false)
    setExportFormat(format)
    const zip = new JSZip()
    const wasPlaying = presentationPlaying
    setPresentationMode(true)
    setPresentationPlaying(false)
    const meta = EXPORT_FORMATS.find((f) => f.id === format)!

    try {
      for (let i = 0; i < Math.min(municipiosComDados.length, 12); i++) {
        setPresentationIndex(i)
        await new Promise((r) => setTimeout(r, 1800))
        const canvas = await html2canvas(mapAreaRef.current!, {
          backgroundColor: '#0f172a',
          scale: 1.5,
          useCORS: true,
        })
        const blob = await canvasToBlob(canvas, format)
        if (blob) {
          const m = municipiosComDados[i]
          const slug = `${String(i + 1).padStart(2, '0')}-${(m.nome || `ibge-${m.ibge}`)
            .replace(/[^a-z0-9]+/gi, '-')
            .toLowerCase()}`
          zip.file(buildExportFilename(format, 'frame', slug), blob)
        }
      }
      const content = await zip.generateAsync({ type: 'blob' })
      downloadBlob(content, `apresentacao-faccoes-ro-${meta.ext}-${Date.now()}.zip`)
      toast.success(`ZIP exportado com frames em ${meta.label}`)
    } catch {
      toast.error('Falha ao gerar apresentação')
    } finally {
      setPresentationPlaying(wasPlaying)
      setExporting(false)
    }
  }

  const selectedStat = selectedIbge
    ? statsByIbge[selectedIbge] ?? (selectedNome ? statsByNome[selectedNome] : null)
    : selectedNome
      ? statsByNome[selectedNome]
      : null

  /** Stats originais (sem filtro) para a lista lateral — não esconder vínculos por filtro visual. */
  const selectedStatRaw = useMemo(() => {
    if (!stats) return null
    if (selectedIbge) {
      const byIbge = stats.municipios.find((m) => m.ibge === selectedIbge)
      if (byIbge) return byIbge
    }
    if (selectedNome) return stats.municipios.find((m) => m.nome === selectedNome) ?? null
    return null
  }, [stats, selectedIbge, selectedNome])

  const filteredUnidades = useMemo(() => {
    // 1. Filtrar as unidades com base no termo de busca (unidadeInput) se houver
    const list = unidadeInput
      ? unidades.filter((u) => containsNormalized(u, unidadeInput))
      : unidades

    // 2. Se houver um município selecionado (ex: "Porto Velho")
    if (selectedNome) {
      const selectedNomeNorm = selectedNome.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")

      // Separar as unidades da comarca do município selecionado das demais
      const localUnidades: string[] = []
      const otherUnidades: string[] = []

      for (const u of list) {
        // Encontrar no catálogo UNIDADES_ENDERECOS_RO se essa unidade pertence à comarca selecionada
        const match = UNIDADES_ENDERECOS_RO.find(
          (item) => item.unidade.toUpperCase() === u.toUpperCase()
        )
        
        if (match) {
          const comarcaNorm = match.comarca.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
          if (comarcaNorm === selectedNomeNorm) {
            localUnidades.push(u)
            continue
          }
        }
        
        // Também aceita se o nome da unidade contém o próprio nome do município
        if (containsNormalized(u, selectedNome)) {
          localUnidades.push(u)
        } else {
          otherUnidades.push(u)
        }
      }

      // Se o usuário já digitou algo, mostramos as locais primeiro e depois as outras
      if (unidadeInput) {
        return [...localUnidades, ...otherUnidades]
      }
      
      // Se ele não digitou nada, sugerimos as locais primeiro,
      // e completamos com as outras para que ele veja todas as opções
      const combined = [...localUnidades, ...otherUnidades]
      return combined.slice(0, 30) // Exibe até 30 opções para melhor usabilidade
    }

    return list.slice(0, 15)
  }, [unidades, unidadeInput, selectedNome])

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
                  Mapa de Facções — Rondônia
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
            <Link href="/lista-enderecos" className="btn-secondary text-xs gap-1.5">
              <List className="w-3.5 h-3.5" /> Endereços
            </Link>
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
            <div className="relative" ref={exportMenuRef}>
              <button
                type="button"
                onClick={() => setExportMenuOpen((o) => !o)}
                disabled={exporting}
                className="btn-secondary text-xs gap-1.5"
                aria-haspopup="menu"
                aria-expanded={exportMenuOpen}
              >
                {exporting ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Download className="w-3.5 h-3.5" />
                )}
                Exportar
                <ChevronDown className={`w-3 h-3 transition-transform ${exportMenuOpen ? 'rotate-180' : ''}`} />
              </button>
              {exportMenuOpen && (
                <div
                  role="menu"
                  className="absolute right-0 top-full mt-1.5 z-[1200] w-64 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-2xl overflow-hidden"
                >
                  <div className="px-3 py-2 border-b border-gray-100 dark:border-gray-800">
                    <p className="text-[10px] font-black uppercase tracking-wider text-subtle flex items-center gap-1.5">
                      <ImageIcon className="w-3 h-3" /> Formato da imagem
                    </p>
                    <p className="text-[10px] text-subtle mt-0.5">
                      Exporta o mapa visível (filtros e destaque incluídos)
                    </p>
                  </div>
                  <div className="p-1.5 space-y-0.5">
                    {EXPORT_FORMATS.map((fmt) => (
                      <button
                        key={fmt.id}
                        type="button"
                        role="menuitem"
                        disabled={exporting}
                        onClick={() => void exportMapImage(fmt.id)}
                        className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors flex items-start gap-2.5 hover:bg-sigma-500/10 ${
                          exportFormat === fmt.id ? 'bg-sigma-500/5' : ''
                        }`}
                      >
                        <span className="mt-0.5 font-black text-xs w-10 shrink-0 text-sigma-600 dark:text-sigma-400">
                          {fmt.label}
                        </span>
                        <span className="min-w-0">
                          <span className="block font-semibold text-gray-900 dark:text-white text-xs">
                            Mapa · .{fmt.ext}
                          </span>
                          <span className="block text-[10px] text-subtle leading-snug">{fmt.hint}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                  <div className="border-t border-gray-100 dark:border-gray-800 p-1.5 space-y-0.5">
                    <p className="px-3 pt-1 pb-0.5 text-[10px] font-black uppercase tracking-wider text-subtle">
                      Apresentação (ZIP)
                    </p>
                    {EXPORT_FORMATS.map((fmt) => (
                      <button
                        key={`zip-${fmt.id}`}
                        type="button"
                        role="menuitem"
                        disabled={exporting || municipiosComDados.length === 0}
                        onClick={() => void exportApresentacao(fmt.id)}
                        className="w-full text-left px-3 py-2 rounded-lg text-sm transition-colors flex items-center gap-2.5 hover:bg-amber-500/10 disabled:opacity-40"
                      >
                        <Download className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                        <span className="min-w-0">
                          <span className="block font-semibold text-gray-900 dark:text-white text-xs">
                            ZIP frames · {fmt.label}
                          </span>
                          <span className="block text-[10px] text-subtle">
                            Até 12 municípios · .{fmt.ext}
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <button type="button" onClick={() => setShowRelatorio(true)} className="btn-primary text-xs gap-1.5">
              <FileBarChart className="w-3.5 h-3.5" /> Relatório
            </button>
          </div>
        </div>

        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mt-3">
            {[
              {
                icon: Users,
                label: filtroFaccao ? `Integrantes · ${filtroFaccaoLabel}` : 'Faccionados mapeados',
                value: filtroFaccao ? totalIntegrantesFiltrado : stats.totais.vinculos,
                color: 'text-red-500',
              },
              { icon: Brain, label: 'Via AIP (auto)', value: stats.totais.aipAuto ?? 0, color: 'text-purple-500' },
              {
                icon: MapPin,
                label: filtroFaccao ? 'Mun. com a facção' : 'Municípios',
                value: filtroFaccao ? municipiosComDados.length : stats.totais.municipiosComDados,
                color: 'text-blue-500',
              },
              { icon: Building2, label: 'Unidades', value: stats.totais.unidadesComDados, color: 'text-amber-500' },
              {
                icon: Shield,
                label: 'Cobertura RO',
                value: `${Math.round(((filtroFaccao ? municipiosComDados.length : stats.totais.municipiosComDados) / 52) * 100)}%`,
                color: 'text-emerald-500',
              },
            ].map((k) => (
              <div
                key={k.label}
                className={`rounded-xl bg-gray-50 dark:bg-gray-900/60 border px-3 py-2 ${
                  filtroFaccao
                    ? 'border-amber-400/40 dark:border-amber-500/30'
                    : 'border-gray-200/80 dark:border-gray-700/80'
                }`}
              >
                <div className="flex items-center gap-2">
                  <k.icon className={`w-3.5 h-3.5 ${k.color}`} />
                  <span className="text-[10px] font-bold uppercase text-subtle tracking-wide truncate">{k.label}</span>
                </div>
                <p className="text-lg font-black text-gray-900 dark:text-white mt-0.5">{k.value}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex-1 min-h-0 flex flex-col lg:flex-row gap-0 lg:gap-4 p-3 md:p-4">
        <div className="relative flex-1 min-h-[320px] lg:min-h-0 flex flex-col gap-2.5 min-w-0">
          <MapaFaccoesFilters
            bandas={faccoesBandas}
            filtroFaccao={filtroFaccao}
            onFiltroFaccao={setFiltroFaccao}
            soComAtuacao={soComAtuacao}
            onSoComAtuacao={setSoComAtuacao}
            totalFiltrado={totalIntegrantesFiltrado}
            municipiosFiltrados={municipiosComDados.length}
          />

          <div
            ref={mapAreaRef}
            className="relative flex-1 min-h-[280px] rounded-2xl overflow-hidden border border-gray-200 dark:border-gray-700 shadow-xl"
          >
            <MapaFaccoesMap
              geojson={geojson}
              municipios={municipiosMapa}
              statsByIbge={statsByIbge}
              statsByNome={statsByNome}
              maxApenados={maxApenadosMapa}
              selectedIbge={selectedIbge}
              highlightIbge={highlightIbge}
              onSelect={handleSelectMunicipio}
              presentationMode={presentationMode}
              linkMode={!!pendingMapaLink}
              hideEmpty={soComAtuacao}
              filtroAtivo={!!filtroFaccao}
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

            <AnimatePresence mode="wait">
              {(() => {
                // Apresentação tem prioridade; senão, seleção do usuário abre o spotlight cinematográfico
                const focusIbge = presentationMode ? highlightIbge : selectedIbge
                const focusStat = focusIbge
                  ? statsByIbge[focusIbge]
                  : selectedNome
                    ? statsByNome[selectedNome]
                    : null
                if (!focusStat && !(selectedNome && !presentationMode)) return null
                const nome =
                  focusStat?.nome ||
                  selectedNome ||
                  (focusIbge ? IBGE_PARA_NOME[focusIbge] : null) ||
                  'Município'
                const ibgeKey = focusIbge ?? selectedIbge ?? nome
                // Sem município em foco e sem seleção: mapa limpo a tela cheia
                if (!presentationMode && !selectedNome) return null
                if (presentationMode && !highlightIbge) return null
                const statForPanel = focusStat ?? {
                  ibge: selectedIbge,
                  nome,
                  totalApenados: 0,
                  faccaoPredominante: '—',
                  faccaoCor: '#6b7280',
                  faccoes: {},
                }
                const up = resolveUnidadesPrisionaisMunicipio(focusIbge, nome)
                return (
                  <MunicipioSpotlightPanel
                    key={`${ibgeKey}-${filtroFaccao ?? 'all'}`}
                    nome={nome}
                    stat={statForPanel}
                    presentationMode={presentationMode}
                    filtroFaccaoLabel={filtroFaccaoLabel}
                    totalPresosUnidades={up?.totalApenados ?? 0}
                    unidadesPresos={up?.unidades ?? []}
                    onClose={
                      presentationMode
                        ? undefined
                        : () => {
                            setSelectedIbge(null)
                            setSelectedNome(null)
                          }
                    }
                  />
                )
              })()}
            </AnimatePresence>

            <div
              className={`absolute top-3 left-3 z-[1000] bg-gray-950/85 backdrop-blur-md rounded-xl px-3 py-2.5 text-[10px] text-gray-300 border border-white/10 max-w-[210px] transition-opacity ${
                (presentationMode && highlightIbge) || (!presentationMode && selectedNome)
                  ? 'opacity-40 hover:opacity-100'
                  : 'opacity-100'
              }`}
            >
              <p className="font-bold text-white mb-1.5">Legenda</p>
              <p className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-sm bg-[#dc2626] ring-1 ring-white/40" /> Comando Vermelho</p>
              <p className="flex items-center gap-1.5 mt-0.5">
                <PccStripeSwatch />
                <span className="text-white font-semibold">PCC</span>
                <span className="text-gray-400">(listrado)</span>
              </p>
              <p className="flex items-center gap-1.5 mt-0.5"><span className="inline-block w-3 h-3 rounded-sm bg-[#7c3aed] ring-1 ring-white/40" /> TCP</p>
              <p className="mt-0.5 text-gray-400">Outras: cor própria</p>
              <p className="mt-0.5 text-gray-400">Contorno claro = divisão municipal</p>
              <p className="mt-0.5 text-amber-400/90">Dourado = município em foco</p>
              <p className={`mt-1.5 ${pendingMapaLink ? 'text-amber-300 font-bold' : 'text-sky-400'}`}>
                {pendingMapaLink
                  ? 'Modo vínculo: clique no município'
                  : filtroFaccao
                    ? `Filtro ativo: ${filtroFaccaoLabel}`
                    : 'Clique no município para detalhar'}
              </p>
            </div>
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
                  {(() => {
                    const href = listaEnderecosHrefFromUnidadeAip(pendingMapaLink.unidade)
                    return href ? (
                      <Link href={href} className="font-bold text-blue-600 dark:text-blue-400 hover:underline">
                        {pendingMapaLink.unidade}
                      </Link>
                    ) : (
                      pendingMapaLink.unidade
                    )
                  })()}
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
                    {(selectedStatRaw || selectedStat) && (
                      <div className="flex flex-wrap gap-2 mt-2">
                        <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/10 text-red-600 dark:text-red-400 font-bold">
                          {(selectedStatRaw ?? selectedStat)!.totalApenados} faccionados
                        </span>
                        {filtroFaccao && selectedStat && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300 font-bold">
                            {selectedStat.totalApenados} no filtro
                          </span>
                        )}
                        <FaccaoMapaBadge
                          label={(selectedStatRaw ?? selectedStat)!.faccaoPredominante}
                          cor={(selectedStatRaw ?? selectedStat)!.faccaoCor}
                          estiloMapa={(selectedStatRaw ?? selectedStat)!.estiloMapa}
                        />
                        {((selectedStatRaw ?? selectedStat)!.estiloMapa?.bandas ?? []).slice(1).map((b) => (
                          <span
                            key={b.label}
                            className="text-xs px-2 py-0.5 rounded-full font-bold"
                            style={{ backgroundColor: `${b.cor}22`, color: b.striped ? '#e5e7eb' : b.cor }}
                          >
                            + {b.label}: {b.count}
                          </span>
                        ))}
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
                            {(() => {
                              const href = listaEnderecosHrefFromUnidadeAip(v.unidadePrisional)
                              return href ? (
                                <Link href={href} className="line-clamp-2 font-semibold text-blue-600 dark:text-blue-400 hover:underline">
                                  {v.unidadePrisional}
                                </Link>
                              ) : (
                                <span className="line-clamp-2">{v.unidadePrisional}</span>
                              )
                            })()}
                          </p>
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            <FaccaoMapaBadge
                              label={v.apenado.faccaoDisplay}
                              cor={v.apenado.faccaoCor}
                              showStripeHint={false}
                            />
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

      <MapaFaccoesRelatorioModal open={showRelatorio} onClose={() => setShowRelatorio(false)} />

      <style jsx global>{`
        .mapa-faccao-tooltip {
          background: rgba(15, 23, 42, 0.94) !important;
          border: 1px solid rgba(255,255,255,0.14) !important;
          color: #f8fafc !important;
          border-radius: 10px !important;
          font-size: 11px !important;
          padding: 8px 12px !important;
          box-shadow: 0 12px 40px rgba(0,0,0,0.45) !important;
        }
        .leaflet-container {
          background: #0f172a;
          font-family: inherit;
        }
        /* Contornos e glow do município em foco — melhora a leitura em apresentação */
        .leaflet-interactive.mapa-mun {
          stroke-linejoin: round;
          stroke-linecap: round;
        }
        .leaflet-interactive.mapa-mun-focused {
          filter: drop-shadow(0 0 10px rgba(251, 191, 36, 0.85))
            drop-shadow(0 0 2px rgba(255, 255, 255, 0.9));
          stroke-linejoin: round;
          animation: mapa-mun-pulse 2.2s ease-in-out infinite;
        }
        @keyframes mapa-mun-pulse {
          0%, 100% {
            filter: drop-shadow(0 0 8px rgba(251, 191, 36, 0.7))
              drop-shadow(0 0 1px rgba(255, 255, 255, 0.8));
          }
          50% {
            filter: drop-shadow(0 0 16px rgba(251, 191, 36, 1))
              drop-shadow(0 0 4px rgba(255, 255, 255, 1));
          }
        }
      `}</style>
    </div>
  )
}