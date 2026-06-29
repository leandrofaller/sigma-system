'use client'

import { useMemo, useState } from 'react'
import {
  Building2, MapPin, Search, ExternalLink, Navigation, Copy, Check,
  ChevronRight, X, List,
} from 'lucide-react'
import { toast } from 'sonner'
import { containsNormalized } from '@/lib/search'
import {
  UNIDADES_ENDERECOS_RO,
  COMARCAS_RO,
  formatCep,
  enderecoCompleto,
  googleMapsSearchUrl,
  googleMapsEmbedUrl,
  googleMapsDirectionsUrl,
  filtrarUnidades,
  type UnidadeEndereco,
} from '@/lib/unidades-enderecos-ro'

function UnidadeCard({
  unidade,
  selected,
  onSelect,
}: {
  unidade: UnidadeEndereco
  selected: boolean
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
          <p className="text-[10px] font-bold uppercase tracking-wide text-blue-600 dark:text-blue-400">
            {unidade.comarca}
          </p>
          <p className="font-bold text-sm text-gray-900 dark:text-white mt-0.5 leading-snug">
            {unidade.unidade}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1.5 line-clamp-2">
            {unidade.endereco}
          </p>
          {unidade.cep && (
            <p className="text-[10px] font-mono text-subtle mt-1">CEP {formatCep(unidade.cep)}</p>
          )}
        </div>
        <ChevronRight className={`w-4 h-4 shrink-0 mt-1 ${selected ? 'text-blue-500' : 'text-gray-300'}`} />
      </div>
    </button>
  )
}

function DetalheUnidade({
  unidade,
  onClose,
}: {
  unidade: UnidadeEndereco
  onClose?: () => void
}) {
  const [copied, setCopied] = useState(false)

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
      <div className="p-4 md:p-5 border-b border-gray-200 dark:border-gray-700 shrink-0">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded-full">
              <MapPin className="w-3 h-3" />
              {unidade.comarca}
            </span>
            <h2 className="font-black text-base md:text-lg text-gray-900 dark:text-white mt-2 leading-snug">
              {unidade.unidade}
            </h2>
          </div>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="lg:hidden p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-subtle"
            >
              <X className="w-5 h-5" />
            </button>
          )}
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
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mt-4">
          <a
            href={googleMapsSearchUrl(unidade)}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-primary text-xs gap-1.5"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Abrir no Google Maps
          </a>
          <a
            href={googleMapsDirectionsUrl(unidade)}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-secondary text-xs gap-1.5"
          >
            <Navigation className="w-3.5 h-3.5" />
            Como chegar
          </a>
          <button type="button" onClick={copiar} className="btn-secondary text-xs gap-1.5">
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
            Copiar endereço
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-[240px] relative bg-gray-100 dark:bg-gray-900">
        <iframe
          title={`Mapa — ${unidade.unidade}`}
          src={googleMapsEmbedUrl(unidade)}
          className="absolute inset-0 w-full h-full border-0"
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          allowFullScreen
        />
      </div>
    </div>
  )
}

export function ListaEnderecosClient() {
  const [search, setSearch] = useState('')
  const [comarcaFilter, setComarcaFilter] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const filtradas = useMemo(
    () => filtrarUnidades(UNIDADES_ENDERECOS_RO, search, comarcaFilter),
    [search, comarcaFilter]
  )

  const porComarca = useMemo(() => {
    const map = new Map<string, UnidadeEndereco[]>()
    for (const u of filtradas) {
      const list = map.get(u.comarca) ?? []
      list.push(u)
      map.set(u.comarca, list)
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b))
  }, [filtradas])

  const selected = useMemo(
    () => UNIDADES_ENDERECOS_RO.find((u) => u.id === selectedId) ?? null,
    [selectedId]
  )

  const handleSelect = (id: string) => setSelectedId(id)

  const comarcaMatches = (c: string) =>
    !search.trim() || containsNormalized(c, search) || filtradas.some((u) => u.comarca === c)

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
                Unidades prisionais de Rondônia — {UNIDADES_ENDERECOS_RO.length} endereços · {COMARCAS_RO.length} comarcas
              </p>
            </div>
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
              !comarcaFilter
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 dark:bg-gray-800 text-subtle hover:bg-gray-200 dark:hover:bg-gray-700'
            }`}
          >
            Todas ({UNIDADES_ENDERECOS_RO.length})
          </button>
          {COMARCAS_RO.filter(comarcaMatches).map((c) => {
            const count = UNIDADES_ENDERECOS_RO.filter((u) => u.comarca === c).length
            const visible = filtradas.filter((u) => u.comarca === c).length
            return (
              <button
                key={c}
                type="button"
                onClick={() => setComarcaFilter(comarcaFilter === c ? null : c)}
                className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all whitespace-nowrap ${
                  comarcaFilter === c
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 dark:bg-gray-800 text-subtle hover:bg-gray-200 dark:hover:bg-gray-700'
                }`}
              >
                {c} ({search || comarcaFilter ? visible : count})
              </button>
            )
          })}
        </div>
      </div>

      <div className="flex-1 min-h-0 flex flex-col lg:flex-row">
        <div className={`w-full lg:w-[420px] shrink-0 flex flex-col min-h-0 border-b lg:border-b-0 lg:border-r border-gray-200 dark:border-gray-700 ${selected ? 'hidden lg:flex' : 'flex'}`}>
          <div className="px-4 py-2 bg-gray-50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-700 shrink-0">
            <p className="text-[10px] font-bold uppercase text-subtle tracking-wide">
              {filtradas.length} unidade{filtradas.length !== 1 ? 's' : ''} encontrada{filtradas.length !== 1 ? 's' : ''}
            </p>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-4">
            {filtradas.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-subtle gap-2">
                <MapPin className="w-10 h-10 opacity-30" />
                <p className="text-sm font-bold">Nenhuma unidade encontrada</p>
                <p className="text-xs">Tente outro termo ou limpe os filtros</p>
              </div>
            ) : (
              porComarca.map(([comarca, unidades]) => (
                <div key={comarca}>
                  <p className="text-[10px] font-black uppercase tracking-widest text-blue-600/80 dark:text-blue-400/80 mb-2 px-1 sticky top-0 bg-gray-50/95 dark:bg-gray-950/95 py-1 backdrop-blur-sm z-10">
                    {comarca}
                  </p>
                  <div className="space-y-2">
                    {unidades.map((u) => (
                      <UnidadeCard
                        key={u.id}
                        unidade={u}
                        selected={selectedId === u.id}
                        onSelect={() => handleSelect(u.id)}
                      />
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className={`flex-1 min-h-0 flex flex-col ${!selected ? 'hidden lg:flex' : 'flex'}`}>
          {selected ? (
            <DetalheUnidade
              unidade={selected}
              onClose={() => setSelectedId(null)}
            />
          ) : (
            <div className="flex flex-col items-center justify-center flex-1 p-8 text-center text-subtle">
              <MapPin className="w-12 h-12 opacity-25 mb-3" />
              <p className="font-bold text-gray-700 dark:text-gray-300">Selecione uma unidade</p>
              <p className="text-xs mt-2 max-w-xs">
                Escolha uma unidade na lista para ver o endereço completo e a localização no Google Maps.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}