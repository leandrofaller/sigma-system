'use client'

import { Filter, X, Eye, EyeOff } from 'lucide-react'
import type { FaccaoBanda } from '@/lib/mapa-faccoes'
import { faccaoFiltroId, labelFaccaoFiltro } from '@/lib/mapa-faccoes'
import { FaccaoMapaBadge, PccStripeSwatch } from './FaccaoMapaBadge'

export interface MapaFaccoesFiltersProps {
  bandas: FaccaoBanda[]
  filtroFaccao: string | null
  onFiltroFaccao: (id: string | null) => void
  soComAtuacao: boolean
  onSoComAtuacao: (v: boolean) => void
  totalFiltrado: number
  municipiosFiltrados: number
}

export function MapaFaccoesFilters({
  bandas,
  filtroFaccao,
  onFiltroFaccao,
  soComAtuacao,
  onSoComAtuacao,
  totalFiltrado,
  municipiosFiltrados,
}: MapaFaccoesFiltersProps) {
  const ativo = !!filtroFaccao || soComAtuacao
  const filtroLabel = filtroFaccao
    ? labelFaccaoFiltro(filtroFaccao, bandas)
    : null

  return (
    <div className="rounded-2xl border border-white/10 bg-gray-950/85 backdrop-blur-md shadow-xl overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 border-b border-white/5">
        <div className="flex items-center gap-2 min-w-0">
          <Filter className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <span className="text-[10px] font-black uppercase tracking-widest text-amber-400/90">
            Filtros avançados
          </span>
          {ativo && (
            <span className="text-[10px] text-gray-400 truncate">
              {filtroLabel ? (
                <>
                  <span className="text-white font-semibold">{filtroLabel}</span>
                  {' · '}
                </>
              ) : null}
              {totalFiltrado.toLocaleString('pt-BR')} integrantes · {municipiosFiltrados} mun.
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => onSoComAtuacao(!soComAtuacao)}
            className={`inline-flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-lg border transition-colors ${
              soComAtuacao
                ? 'bg-emerald-500/20 border-emerald-400/40 text-emerald-300'
                : 'bg-white/5 border-white/10 text-gray-400 hover:text-white hover:border-white/20'
            }`}
            title="Exibe só municípios com faccionados (conforme o filtro de facção)"
          >
            {soComAtuacao ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
            Só com atuação
          </button>
          {ativo && (
            <button
              type="button"
              onClick={() => {
                onFiltroFaccao(null)
                onSoComAtuacao(false)
              }}
              className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
            >
              <X className="w-3 h-3" /> Limpar
            </button>
          )}
        </div>
      </div>

      <div className="px-3 py-2.5 flex gap-2 overflow-x-auto scrollbar-thin">
        <button
          type="button"
          onClick={() => onFiltroFaccao(null)}
          className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${
            !filtroFaccao
              ? 'bg-white text-gray-950 border-white shadow-lg shadow-white/10 scale-[1.02]'
              : 'bg-white/5 text-gray-300 border-white/10 hover:bg-white/10 hover:border-white/20'
          }`}
        >
          Todas
        </button>

        {bandas.map((b) => {
          const id = faccaoFiltroId(b.label)
          const selected = filtroFaccao === id
          return (
            <button
              key={id}
              type="button"
              onClick={() => onFiltroFaccao(selected ? null : id)}
              className={`shrink-0 inline-flex items-center gap-2 pl-2 pr-2.5 py-1.5 rounded-full text-xs font-bold border transition-all ${
                selected
                  ? 'shadow-lg scale-[1.03] ring-2 ring-offset-1 ring-offset-gray-950'
                  : 'bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20'
              }`}
              style={
                selected
                  ? {
                      backgroundColor: b.striped ? '#0a0a0a' : `${b.cor}33`,
                      borderColor: b.striped ? '#f8fafc' : b.cor,
                      color: b.striped ? '#f8fafc' : b.cor,
                      boxShadow: b.striped
                        ? '0 0 0 2px #f8fafc'
                        : `0 0 0 2px ${b.cor}`,
                    }
                  : undefined
              }
              title={`Filtrar mapa por ${b.label}`}
            >
              {b.striped ? (
                <PccStripeSwatch className="w-3 h-3" />
              ) : (
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0 ring-1 ring-white/30"
                  style={{ backgroundColor: b.cor }}
                />
              )}
              <span className={selected ? '' : 'text-gray-200'}>{b.label}</span>
              <span
                className={`tabular-nums px-1.5 py-0.5 rounded-md text-[10px] font-black ${
                  selected ? 'bg-black/30 text-inherit' : 'bg-white/10 text-gray-300'
                }`}
              >
                {b.count.toLocaleString('pt-BR')}
              </span>
            </button>
          )
        })}

        {bandas.length === 0 && (
          <span className="text-[11px] text-gray-500 self-center">
            Nenhuma facção mapeada ainda — sincronize o AIP.
          </span>
        )}
      </div>

      {filtroFaccao && (
        <div className="px-3 pb-2.5 flex items-center gap-2">
          <FaccaoMapaBadge
            label={filtroLabel ?? filtroFaccao}
            cor={bandas.find((b) => faccaoFiltroId(b.label) === filtroFaccao)?.cor ?? '#6b7280'}
            size="xs"
          />
          <p className="text-[10px] text-gray-400 leading-snug">
            O mapa mostra apenas a atuação desta facção e o quantitativo de integrantes por município.
            Os vínculos e demais abas permanecem intactos.
          </p>
        </div>
      )}
    </div>
  )
}
