'use client'

import { useMemo, useState, useEffect, useCallback } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import {
  Building2, MapPin, Search, ExternalLink, Navigation, Copy, Check,
  ChevronRight, X, List, Map as MapIcon, Users, Shield, Loader2, Pencil, Clock, Plus,
} from 'lucide-react'
import { toast } from 'sonner'
import { containsNormalized } from '@/lib/search'
import {
  formatCep,
  enderecoCompleto,
  googleMapsSearchUrl,
  googleMapsDirectionsUrl,
  filtrarUnidades,
  type UnidadeEndereco,
} from '@/lib/unidades-enderecos-ro'
import { mapaFaccoesHref } from '@/lib/unidades-enderecos-resolver'
import type { GeoResumoUnidade } from '@/lib/geo-vinculo-resumo'
import { UnidadeEditarModal } from './UnidadeEditarModal'
import { UnidadesEnderecosAprovacao } from './UnidadesEnderecosAprovacao'

const UnidadeEnderecoMap = dynamic(() => import('./UnidadeEnderecoMap'), { ssr: false })

interface GeoResumoPayload {
  porUnidade: GeoResumoUnidade[]
}

interface VinculoPreview {
  id: string
  apenado: { nome: string; sipeId: number; faccaoDisplay: string; faccaoCor: string }
}

function UnidadeCard({
  unidade,
  selected,
  resumo,
  onSelect,
}: {
  unidade: UnidadeEndereco
  selected: boolean
  resumo?: GeoResumoUnidade
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full text-left rounded-xl border p-3.5 transition-all ${
        selected
          ? 'border-blue-500 bg-blue-50/80 dark:bg-blue-950/30 shadow-md ring-2 ring-blue-500/30'
          : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/80 hover:border-blue-300 dark:hover:border-blue-700 hover:shadow-sm'
      }`}
    >
      <div className="flex items-start gap-2">
        <Building2 className={`w-4 h-4 mt-0.5 shrink-0 ${selected ? 'text-blue-500' : 'text-gray-400'}`} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1">
            <p className="text-[10px] font-bold uppercase tracking-wide text-blue-600 dark:text-blue-400">
              {unidade.comarca}
            </p>
            {unidade.alteracaoPendente && (
              <span className="text-[8px] font-bold px-1 py-0.5 rounded bg-amber-500/15 text-amber-700 dark:text-amber-300">
                pendente
              </span>
            )}
            {unidade.criadaNoSistema && (
              <span className="text-[8px] font-bold px-1 py-0.5 rounded bg-cyan-500/15 text-cyan-700 dark:text-cyan-400">
                nova
              </span>
            )}
            {unidade.customizado && !unidade.alteracaoPendente && !unidade.criadaNoSistema && (
              <span className="text-[8px] font-bold px-1 py-0.5 rounded bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">
                atualizado
              </span>
            )}
          </div>
          <p className="font-bold text-sm text-gray-900 dark:text-white mt-0.5 leading-snug">
            {unidade.unidade}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1.5 line-clamp-2">
            {unidade.endereco}
          </p>
          {resumo && (resumo.vinculosMapa > 0 || resumo.apenadosAip > 0) && (
            <div className="flex flex-wrap gap-1 mt-2">
              {resumo.vinculosMapa > 0 && (
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-red-500/10 text-red-600 dark:text-red-400">
                  {resumo.vinculosMapa} no mapa
                </span>
              )}
              {resumo.apenadosAip > 0 && (
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-600 dark:text-purple-400">
                  {resumo.apenadosAip} no AIP
                </span>
              )}
            </div>
          )}
        </div>
        <ChevronRight className={`w-4 h-4 shrink-0 mt-1 ${selected ? 'text-blue-500' : 'text-gray-300'}`} />
      </div>
    </button>
  )
}

function DetalheUnidade({
  unidade,
  resumo,
  onClose,
  onEditar,
  ocultarMapa = false,
  podeEditar = true,
}: {
  unidade: UnidadeEndereco
  resumo?: GeoResumoUnidade
  onClose?: () => void
  onEditar: () => void
  ocultarMapa?: boolean
  podeEditar?: boolean
}) {
  const [copied, setCopied] = useState(false)
  const [vinculos, setVinculos] = useState<VinculoPreview[]>([])
  const [loadingVinculos, setLoadingVinculos] = useState(false)

  const mapaHref = resumo?.municipio
    ? mapaFaccoesHref(resumo.municipio, resumo.municipioIbge)
    : '/mapa-faccoes'

  const temGeo = unidade.latitude != null && unidade.longitude != null

  useEffect(() => {
    let cancelled = false
    setLoadingVinculos(true)
    const params = new URLSearchParams({ unidadeId: unidade.id, limit: '8' })
    if (resumo?.municipio) params.set('municipio', resumo.municipio)
    if (resumo?.municipioIbge) params.set('ibge', String(resumo.municipioIbge))

    fetch(`/api/geo-vinculo/vinculos?${params}`)
      .then((r) => (r.ok ? r.json() : { vinculos: [] }))
      .then((d) => {
        if (!cancelled) setVinculos(d.vinculos ?? [])
      })
      .finally(() => {
        if (!cancelled) setLoadingVinculos(false)
      })

    return () => { cancelled = true }
  }, [unidade.id, resumo?.municipio, resumo?.municipioIbge])

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(enderecoCompleto(unidade))
      setCopied(true)
      toast.success('Endereço copiado')
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('Não foi possível copiar')
    }
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="p-4 md:p-5 border-b border-gray-200 dark:border-gray-700 shrink-0 max-h-[55%] overflow-y-auto">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded-full">
              <MapPin className="w-3 h-3" />
              {unidade.comarca}
            </span>
            <h2 className="font-black text-base md:text-lg text-gray-900 dark:text-white mt-2 leading-snug">
              {unidade.unidade}
            </h2>
            {unidade.alteracaoPendente && (
              <p className="text-[10px] text-amber-700 dark:text-amber-300 mt-1 flex items-center gap-1">
                <Clock className="w-3 h-3" /> Alteração aguardando aprovação do administrador
              </p>
            )}
            {resumo?.municipio && (
              <p className="text-[10px] text-subtle mt-1">
                Município no mapa: <strong className="text-gray-700 dark:text-gray-300">{resumo.municipio}</strong>
              </p>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {podeEditar && (
              <button type="button" onClick={onEditar} className="p-2 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-950/40 text-blue-600" title="Editar unidade">
                <Pencil className="w-4 h-4" />
              </button>
            )}
            {onClose && (
              <button type="button" onClick={onClose} className="lg:hidden p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-subtle">
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>

        <div className="mt-4 space-y-2 text-sm">
          <div className="flex gap-2">
            <MapPin className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" />
            <p className="text-gray-700 dark:text-gray-300">{unidade.endereco}</p>
          </div>
          <div className="flex flex-wrap gap-3 text-xs text-subtle pl-6">
            {unidade.cep ? (
              <span className="font-mono font-bold">CEP {formatCep(unidade.cep)}</span>
            ) : (
              <span className="italic">CEP não informado</span>
            )}
            {temGeo && (
              <span className="font-mono text-emerald-700 dark:text-emerald-400">
                {unidade.latitude!.toFixed(6)}, {unidade.longitude!.toFixed(6)}
              </span>
            )}
          </div>
        </div>

        {resumo && (
          <div className="mt-4 rounded-xl border border-purple-200/60 dark:border-purple-800/50 bg-purple-50/50 dark:bg-purple-950/20 p-3">
            <p className="text-[10px] font-black uppercase tracking-wider text-purple-600 dark:text-purple-400 mb-2">
              Integração AIP · Mapa de Facções
            </p>
            <div className="flex flex-wrap gap-2 text-xs">
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-white/80 dark:bg-gray-900/50 font-bold">
                <Users className="w-3 h-3 text-purple-500" />
                {resumo.apenadosAip} apenado{resumo.apenadosAip !== 1 ? 's' : ''} no AIP
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-white/80 dark:bg-gray-900/50 font-bold">
                <MapIcon className="w-3 h-3 text-red-500" />
                {resumo.vinculosMapa} no mapa
              </span>
            </div>
            <Link href={mapaHref} className="btn-primary w-full mt-3 text-xs gap-1.5 justify-center">
              <MapIcon className="w-3.5 h-3.5" />
              Ver faccionados no Mapa de Facções
            </Link>
            <Link href="/aip" className="btn-secondary w-full mt-2 text-xs gap-1.5 justify-center">
              <Shield className="w-3.5 h-3.5" />
              Abrir AIP
            </Link>
          </div>
        )}

        {loadingVinculos ? (
          <p className="text-xs text-subtle flex items-center gap-2 mt-3">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Carregando faccionados do mapa...
          </p>
        ) : vinculos.length > 0 ? (
          <div className="mt-3 space-y-1.5">
            <p className="text-[10px] font-bold uppercase text-subtle">Faccionados vinculados (mapa)</p>
            {vinculos.map((v) => (
              <div key={v.id} className="text-xs rounded-lg bg-gray-50 dark:bg-gray-800/60 px-2.5 py-1.5 flex justify-between gap-2">
                <span className="font-bold truncate">{v.apenado.nome}</span>
                <span className="text-[10px] shrink-0" style={{ color: v.apenado.faccaoCor }}>
                  {v.apenado.faccaoDisplay}
                </span>
              </div>
            ))}
          </div>
        ) : resumo && resumo.vinculosMapa === 0 && resumo.apenadosAip > 0 ? (
          <p className="text-xs text-amber-700 dark:text-amber-300 mt-3">
            Há apenados no AIP nesta unidade, mas ainda não vinculados ao mapa. Use Sync AIP ou Vincular Mapa no AIP.
          </p>
        ) : null}

        <div className="flex flex-wrap gap-2 mt-4">
          <a href={googleMapsSearchUrl(unidade)} target="_blank" rel="noopener noreferrer" className="btn-primary text-xs gap-1.5">
            <ExternalLink className="w-3.5 h-3.5" /> Google Maps
          </a>
          <a href={googleMapsDirectionsUrl(unidade)} target="_blank" rel="noopener noreferrer" className="btn-secondary text-xs gap-1.5">
            <Navigation className="w-3.5 h-3.5" /> Como chegar
          </a>
          <button type="button" onClick={copiar} className="btn-secondary text-xs gap-1.5">
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
            Copiar
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-[200px] relative bg-gray-100 dark:bg-gray-900">
        {ocultarMapa ? (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-subtle px-4 text-center">
            Mapa oculto durante a edição da unidade
          </div>
        ) : (
          <>
            {!temGeo && (
              <p className="absolute top-2 left-2 right-2 z-[10] text-[10px] text-amber-800 dark:text-amber-200 bg-amber-100/90 dark:bg-amber-950/80 px-2 py-1 rounded-lg pointer-events-none">
                Sem geolocalização — aproximando pelo endereço. Edite a unidade para definir coordenadas exatas.
              </p>
            )}
            <UnidadeEnderecoMap key={`${unidade.id}-${unidade.latitude}-${unidade.longitude}`} unidade={unidade} />
          </>
        )}
      </div>
    </div>
  )
}

export function ListaEnderecosClient({ initialUnidadeId = null }: { initialUnidadeId?: string | null }) {
  const { data: session } = useSession()
  const role = (session?.user as { role?: string } | undefined)?.role
  const isAdmin = role === 'SUPER_ADMIN' || role === 'ADMIN'

  const [search, setSearch] = useState('')
  const [comarcaFilter, setComarcaFilter] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(initialUnidadeId)
  const [geoResumo, setGeoResumo] = useState<GeoResumoPayload | null>(null)
  const [unidades, setUnidades] = useState<UnidadeEndereco[]>([])
  const [comarcas, setComarcas] = useState<string[]>([])
  const [loadingUnidades, setLoadingUnidades] = useState(true)
  const [editando, setEditando] = useState<UnidadeEndereco | null>(null)
  const [criandoUnidade, setCriandoUnidade] = useState(false)

  const carregarUnidades = useCallback(async () => {
    setLoadingUnidades(true)
    try {
      const res = await fetch('/api/unidades-enderecos')
      if (res.ok) {
        const data = await res.json()
        setUnidades(data.unidades ?? [])
        setComarcas(data.comarcas ?? [])
      }
    } finally {
      setLoadingUnidades(false)
    }
  }, [])

  const carregarResumo = useCallback(() => {
    fetch('/api/geo-vinculo/resumo')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setGeoResumo(d))
      .catch(() => {})
  }, [])

  useEffect(() => {
    carregarUnidades()
    carregarResumo()
  }, [carregarUnidades, carregarResumo])

  const resumoPorId = useMemo(() => {
    const m: Record<string, GeoResumoUnidade> = {}
    for (const u of geoResumo?.porUnidade ?? []) m[u.unidadeId] = u
    return m
  }, [geoResumo])

  const filtradas = useMemo(
    () => filtrarUnidades(unidades, search, comarcaFilter),
    [unidades, search, comarcaFilter]
  )

  const porComarca = useMemo(() => {
    const map = new globalThis.Map<string, UnidadeEndereco[]>()
    for (const u of filtradas) {
      const list = map.get(u.comarca) ?? []
      list.push(u)
      map.set(u.comarca, list)
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b))
  }, [filtradas])

  const selected = useMemo(
    () => unidades.find((u) => u.id === selectedId) ?? null,
    [unidades, selectedId]
  )

  const comarcaMatches = (c: string) =>
    !search.trim() || containsNormalized(c, search) || filtradas.some((u) => u.comarca === c)

  const handleUnidadeSalva = (atualizada: UnidadeEndereco, pendente?: boolean) => {
    if (pendente) {
      carregarUnidades()
      return
    }
    setUnidades((prev) => {
      const exists = prev.some((u) => u.id === atualizada.id)
      if (exists) return prev.map((u) => (u.id === atualizada.id ? atualizada : u))
      return [...prev, atualizada].sort(
        (a, b) => a.comarca.localeCompare(b.comarca) || a.unidade.localeCompare(b.unidade)
      )
    })
    setSelectedId(atualizada.id)
    carregarResumo()
  }

  const handleAprovacaoResolvida = () => {
    carregarUnidades()
    carregarResumo()
  }

  if (loadingUnidades) {
    return (
      <div className="flex items-center justify-center h-full gap-2 text-subtle">
        <Loader2 className="w-5 h-5 animate-spin" /> Carregando unidades...
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="px-4 md:px-6 py-3.5 md:py-4 border-b border-gray-200 dark:border-gray-700 shrink-0">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-blue-500/20 to-cyan-500/20 rounded-xl">
              <List className="w-5 h-5 text-blue-500" />
            </div>
            <div>
              <h1 className="text-lg md:text-xl font-bold text-gray-900 dark:text-white">
                Lista de Endereços
              </h1>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Integrada ao AIP e Mapa de Facções — {unidades.length} unidades
                {!isAdmin && ' · criações e edições sujeitas a aprovação'}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setCriandoUnidade(true)}
              className="btn-primary text-xs gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" /> Nova unidade
            </button>
            <Link href="/mapa-faccoes" className="btn-secondary text-xs gap-1.5">
              <MapIcon className="w-3.5 h-3.5" /> Mapa de Facções
            </Link>
          </div>
        </div>

        <div className="relative mt-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por comarca, unidade, endereço ou CEP..."
            className="w-full pl-9 pr-4 py-2.5 text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        <div className="flex flex-wrap gap-1.5 mt-3">
          <button
            type="button"
            onClick={() => setComarcaFilter(null)}
            className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all ${
              !comarcaFilter ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-gray-800 text-subtle hover:bg-gray-200 dark:hover:bg-gray-700'
            }`}
          >
            Todas ({unidades.length})
          </button>
          {comarcas.filter(comarcaMatches).map((c) => {
            const count = unidades.filter((u) => u.comarca === c).length
            const visible = filtradas.filter((u) => u.comarca === c).length
            return (
              <button
                key={c}
                type="button"
                onClick={() => setComarcaFilter(comarcaFilter === c ? null : c)}
                className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all whitespace-nowrap ${
                  comarcaFilter === c ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-gray-800 text-subtle hover:bg-gray-200 dark:hover:bg-gray-700'
                }`}
              >
                {c} ({search || comarcaFilter ? visible : count})
              </button>
            )
          })}
        </div>
      </div>

      {isAdmin && <UnidadesEnderecosAprovacao onResolved={handleAprovacaoResolvida} />}

      <div className="flex-1 min-h-0 flex flex-col lg:flex-row">
        <div className={`w-full lg:w-[420px] shrink-0 flex flex-col min-h-0 border-b lg:border-b-0 lg:border-r border-gray-200 dark:border-gray-700 ${selected ? 'hidden lg:flex' : 'flex'}`}>
          <div className="flex-1 overflow-y-auto p-3 space-y-4">
            {porComarca.map(([comarca, lista]) => (
              <div key={comarca}>
                <p className="text-[10px] font-black uppercase tracking-widest text-blue-600/80 dark:text-blue-400/80 mb-2 px-1 sticky top-0 bg-gray-50/95 dark:bg-gray-950/95 py-1 backdrop-blur-sm z-10">
                  {comarca}
                </p>
                <div className="space-y-2">
                  {lista.map((u) => (
                    <UnidadeCard
                      key={u.id}
                      unidade={u}
                      resumo={resumoPorId[u.id]}
                      selected={selectedId === u.id}
                      onSelect={() => setSelectedId(u.id)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className={`flex-1 min-h-0 flex flex-col ${!selected ? 'hidden lg:flex' : 'flex'}`}>
          {selected ? (
            <DetalheUnidade
              unidade={selected}
              resumo={resumoPorId[selected.id]}
              onClose={() => setSelectedId(null)}
              onEditar={() => setEditando(selected)}
              podeEditar={isAdmin || !selected.criadaNoSistema}
              ocultarMapa={!!editando || criandoUnidade}
            />
          ) : (
            <div className="flex flex-col items-center justify-center flex-1 p-8 text-center text-subtle">
              <MapPin className="w-12 h-12 opacity-25 mb-3" />
              <p className="font-bold text-gray-700 dark:text-gray-300">Selecione uma unidade</p>
            </div>
          )}
        </div>
      </div>

      {editando && (
        <UnidadeEditarModal
          unidade={editando}
          isAdmin={isAdmin}
          comarcas={comarcas}
          onClose={() => setEditando(null)}
          onSaved={handleUnidadeSalva}
        />
      )}

      {criandoUnidade && (
        <UnidadeEditarModal
          isAdmin={isAdmin}
          comarcas={comarcas}
          onClose={() => setCriandoUnidade(false)}
          onSaved={handleUnidadeSalva}
        />
      )}
    </div>
  )
}