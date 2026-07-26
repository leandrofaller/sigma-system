'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Users, Shield, Building2, X, MapPin, Sparkles, FileBarChart } from 'lucide-react'
import { faccaoCor } from '@/lib/mapa-faccoes'
import type { MunicipioMapStats } from './MapaFaccoesMap'
import type { UnidadePresosResumo } from '@/lib/unidades-prisionais-resumo'
import { FaccaoMapaBadge, PccStripeSwatch } from './FaccaoMapaBadge'

interface Props {
  nome: string
  stat: MunicipioMapStats
  /** Total de presos nas unidades do município (aba Unidades Prisionais). */
  totalPresosUnidades: number
  /** Detalhamento por unidade — mesma base da aba Unidades Prisionais. */
  unidadesPresos?: UnidadePresosResumo[]
  presentationMode?: boolean
  filtroFaccaoLabel?: string | null
  onClose?: () => void
  vinculos?: any[]
  loadingVinculos?: boolean
  onOpenRelatorio?: () => void
}

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.12, delayChildren: 0.2 } },
}

const fadeUp = {
  hidden: { opacity: 0, y: 16, scale: 0.98 },
  show: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] },
  },
}

function AnimatedCount({ value, delay = 0 }: { value: number; delay?: number }) {
  const [n, setN] = useState(0)
  useEffect(() => {
    setN(0)
    const start = performance.now()
    const duration = 700
    let raf = 0
    const tick = (t: number) => {
      const p = Math.min(1, (t - start - delay) / duration)
      if (p < 0) {
        raf = requestAnimationFrame(tick)
        return
      }
      // easeOutCubic
      const e = 1 - Math.pow(1 - p, 3)
      setN(Math.round(value * e))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [value, delay])
  return <span className="tabular-nums">{n.toLocaleString('pt-BR')}</span>
}

export function MunicipioSpotlightPanel({
  nome,
  stat,
  totalPresosUnidades,
  unidadesPresos = [],
  presentationMode,
  filtroFaccaoLabel,
  onClose,
  vinculos = [],
  loadingVinculos = false,
  onOpenRelatorio,
}: Props) {
  const faccoes = Object.entries(stat.faccoes ?? {}).sort((a, b) => b[1] - a[1])
  const maxFac = Math.max(1, ...faccoes.map(([, q]) => q))
  const bandas = stat.estiloMapa?.bandas ?? []
  const maxUnidade = Math.max(1, ...unidadesPresos.map((u) => u.totalApenados))

  return (
    <motion.div
      initial={{ opacity: 0, y: 48, scale: 0.94 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 28, scale: 0.96 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="absolute inset-x-3 bottom-3 md:inset-x-6 md:bottom-5 z-[1100] pointer-events-none"
    >
      <div className="pointer-events-auto relative mx-auto max-w-4xl overflow-hidden rounded-3xl border border-gray-800 bg-gray-950 shadow-[0_30px_100px_-15px_rgba(0,0,0,0.98)]">
        {/* Accent line */}
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-amber-400 via-red-500 to-violet-500" />

        <div className="relative p-4 sm:p-6 md:p-7">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                {presentationMode ? (
                  <span className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.2em] font-black text-amber-400">
                    <Sparkles className="w-3 h-3" /> Modo apresentação
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.2em] font-black text-sky-400">
                    <MapPin className="w-3 h-3" /> Município em foco
                  </span>
                )}
                {filtroFaccaoLabel && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/10 text-gray-300 border border-white/10">
                    Filtro: {filtroFaccaoLabel}
                  </span>
                )}
              </div>
              <motion.h3
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.08, duration: 0.4 }}
                className="mt-1.5 text-2xl sm:text-3xl md:text-4xl font-black text-white leading-tight tracking-tight"
              >
                {nome}
              </motion.h3>

              {/* Quantitativos Gerais por Facção logo abaixo do nome do município */}
              {faccoes.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {faccoes.map(([faccao, qtd]) => {
                    const cor = faccaoCor(faccao)
                    return (
                      <span
                        key={faccao}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-white/5 border border-white/10 text-gray-200"
                        style={{ borderLeft: `3px solid ${cor}` }}
                      >
                        <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: cor }} />
                        {faccao}: <strong className="text-white tabular-nums">{qtd}</strong>
                      </span>
                    )
                  })}
                </div>
              )}
            </div>
            {onClose && (
              <div className="flex items-center gap-2 shrink-0">
                {onOpenRelatorio && (
                  <button
                    type="button"
                    onClick={onOpenRelatorio}
                    className="p-2 rounded-xl bg-white/5 hover:bg-white/15 text-gray-300 hover:text-white border border-white/10 transition-colors flex items-center gap-1.5 text-[11px] font-semibold no-print"
                    aria-label="Gerar Relatório do Município"
                  >
                    <FileBarChart className="w-3.5 h-3.5 text-amber-400" />
                    <span className="hidden sm:inline">Relatório</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={onClose}
                  className="p-2 rounded-xl bg-white/5 hover:bg-white/15 text-gray-300 hover:text-white border border-white/10 transition-colors no-print"
                  aria-label="Fechar destaque"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>

          {/* Caixa expansível que abre após destacar o município */}
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            transition={{ delay: 0.35, duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <motion.div
              variants={stagger}
              initial="hidden"
              animate="show"
              className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-3"
            >
            <motion.div
              variants={fadeUp}
              className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 flex items-center justify-between gap-3"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="p-2 rounded-xl bg-red-500/20 text-red-300">
                  <Shield className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-wider font-bold text-gray-400">
                    Faccionados
                  </p>
                  <p className="text-[11px] text-gray-500 truncate">
                    {filtroFaccaoLabel ? 'No filtro ativo' : 'Mapeados no município'}
                  </p>
                </div>
              </div>
              <p className="text-2xl font-black text-red-300 shrink-0">
                <AnimatedCount value={stat.totalApenados} delay={80} />
              </p>
            </motion.div>

            <motion.div
              variants={fadeUp}
              className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 flex items-center justify-between gap-3"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="p-2 rounded-xl bg-amber-500/15 text-amber-300">
                  <Users className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-wider font-bold text-gray-400">
                    Facções ativas
                  </p>
                  <p className="text-[11px] text-gray-500 truncate">Grupos com integrantes</p>
                </div>
              </div>
              <p className="text-2xl font-black text-amber-300 shrink-0">
                <AnimatedCount value={faccoes.length} delay={120} />
              </p>
            </motion.div>
          </motion.div>



          {faccoes.length > 0 ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.35 }}
              className="mt-5 pt-4 border-t border-white/10"
            >
              <p className="text-[10px] uppercase tracking-[0.18em] font-black text-amber-400/90 mb-4">
                Atuação por facção
              </p>

              <div className="flex flex-col md:flex-row gap-6 items-start justify-between">
                {/* Lista de Facções e Integrantes */}
                <div className="flex-1 w-full space-y-4 max-h-[32vh] overflow-y-auto pr-1 custom-scrollbar">
                  {faccoes.map(([faccao, qtd], idx) => {
                    const cor = faccaoCor(faccao)
                    const banda = bandas.find((b) => b.label === faccao)
                    const striped = banda?.striped ?? false
                    const pct = Math.round((qtd / maxFac) * 100)
                    const share =
                      stat.totalApenados > 0
                        ? Math.round((qtd / stat.totalApenados) * 100)
                        : 0

                    const integrantesDaFaccao = vinculos.filter(
                      (v: any) => v.apenado.faccaoDisplay === faccao
                    )

                    return (
                      <motion.div
                        key={faccao}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{
                          duration: 0.4,
                          delay: 0.4 + idx * 0.1,
                          ease: [0.22, 1, 0.36, 1],
                        }}
                        className="group"
                      >
                        <div className="flex items-center justify-between gap-3 mb-1.5">
                          <div className="flex items-center gap-2 min-w-0">
                            <FaccaoMapaBadge
                              label={faccao}
                              cor={cor}
                              estiloMapa={stat.estiloMapa}
                              size="sm"
                            />
                            <span className="text-[11px] text-gray-500 font-medium tabular-nums">
                              {share}% do total
                            </span>
                          </div>
                          <span className="text-lg sm:text-xl font-black text-white tabular-nums shrink-0">
                            <AnimatedCount value={qtd} delay={400 + idx * 100} />
                          </span>
                        </div>
                        <div className="h-2.5 rounded-full bg-white/5 overflow-hidden ring-1 ring-white/10 mb-2">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: pct + '%' }}
                            transition={{
                              duration: 0.85,
                              delay: 0.45 + idx * 0.12,
                              ease: [0.22, 1, 0.36, 1],
                            }}
                            className="h-full rounded-full relative"
                            style={{
                              background: striped
                                ? 'repeating-linear-gradient(45deg,#0a0a0a,#0a0a0a 4px,#f8fafc 4px,#f8fafc 8px)'
                                : 'linear-gradient(90deg, ' + cor + 'cc, ' + cor + ')',
                              boxShadow: striped
                                ? '0 0 12px rgba(248,250,252,0.25)'
                                : '0 0 16px ' + cor + '66',
                            }}
                          />
                        </div>

                        {/* Lista de Integrantes da Facção por Unidade Prisional */}
                        {loadingVinculos ? (
                          <p className="text-[10px] text-gray-500 italic mt-2 ml-2 pl-3">Carregando integrantes...</p>
                        ) : integrantesDaFaccao.length > 0 ? (
                          <div className="mt-2.5 ml-2 pl-3 border-l border-white/10 space-y-4 mb-4">
                            {Object.entries(
                              integrantesDaFaccao.reduce((acc: Record<string, any[]>, v: any) => {
                                const unidade = v.apenado.unidade || v.unidadePrisional || 'Unidade não informada'
                                if (!acc[unidade]) acc[unidade] = []
                                acc[unidade].push(v)
                                return acc
                              }, {})
                            ).map(([unidade, list]: [string, any]) => (
                              <div key={unidade} className="space-y-1.5">
                                <p className="text-[9px] uppercase tracking-wider font-extrabold text-amber-500/90 flex items-center gap-1.5">
                                  <Building2 className="w-3.5 h-3.5 text-amber-500/70" />
                                  {unidade} ({list.length})
                                </p>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[140px] overflow-y-auto pr-1 custom-scrollbar">
                                  {list.map((v: any) => (
                                    <div 
                                      key={v.id} 
                                      className="p-2 rounded-xl bg-white/[0.03] border border-white/5 hover:bg-white/[0.06] hover:border-white/10 transition text-[11px] flex flex-col justify-center min-h-[38px]"
                                    >
                                      <p className="font-bold text-gray-200 truncate leading-none">
                                        {v.apenado.nome}
                                      </p>
                                      {v.apenado.vulgo && (
                                        <p className="text-[9px] text-amber-400/80 truncate mt-1 leading-none">
                                          Vulgo: {v.apenado.vulgo}
                                        </p>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </motion.div>
                    )
                  })}
                </div>

                {/* Gráfico de Pizza/Rosca Donut */}
                <div className="shrink-0 w-full md:w-auto flex flex-col items-center justify-center p-4 bg-white/[0.02] border border-white/5 rounded-2xl min-w-[180px]">
                  <p className="text-[9px] uppercase tracking-wider font-extrabold text-gray-500 mb-3 text-center">
                    Proporção Relativa
                  </p>
                  <div className="relative w-28 h-28 flex items-center justify-center">
                    <svg viewBox="0 0 42 42" className="w-full h-full transform -rotate-90">
                      {(() => {
                        let accumulatedOffset = 0
                        return faccoes.map(([faccao, qtd]) => {
                          const share = stat.totalApenados > 0 ? (qtd / stat.totalApenados) * 100 : 0
                          const cor = faccaoCor(faccao)
                          const offset = accumulatedOffset
                          accumulatedOffset -= share
                          return (
                            <circle
                              key={faccao}
                              cx="21"
                              cy="21"
                              r="15.91549430918954"
                              fill="transparent"
                              stroke={cor}
                              strokeWidth="5"
                              strokeDasharray={share + ' ' + (100 - share)}
                              strokeDashoffset={offset}
                              className="transition-all duration-700 ease-out origin-center"
                            />
                          )
                        })
                      })()}
                      {/* Círculo interno donut */}
                      <circle cx="21" cy="21" r="13.4" fill="#030712" />
                    </svg>
                    
                    {/* Texto interno */}
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                      <span className="text-[8px] uppercase font-bold text-gray-500 tracking-wider leading-none">Total</span>
                      <span className="text-lg font-black text-white leading-none mt-0.5 tabular-nums">{stat.totalApenados}</span>
                      <span className="text-[8px] text-gray-400 font-medium leading-none mt-0.5">presos</span>
                    </div>
                  </div>

                  {/* Legendas coloridas */}
                  <div className="mt-3 w-full space-y-1 text-[10px] text-gray-400 font-medium">
                    {faccoes.map(([faccao, qtd]) => {
                      const cor = faccaoCor(faccao)
                      const share = stat.totalApenados > 0 ? Math.round((qtd / stat.totalApenados) * 100) : 0
                      return (
                        <div key={faccao} className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: cor }} />
                            <span className="truncate text-gray-300">{faccao}</span>
                          </div>
                          <span className="font-bold text-white tabular-nums shrink-0">{share}%</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
              className="mt-5 text-sm text-gray-400 text-center py-4 border-t border-white/10"
            >
              {filtroFaccaoLabel
                ? `Sem registros de ${filtroFaccaoLabel} neste município.`
                : 'Nenhum faccionado mapeado neste município.'}
            </motion.p>
          )}

          {bandas.some((b) => b.striped) && (
            <p className="mt-3 flex items-center gap-1.5 text-[10px] text-gray-500">
              <PccStripeSwatch className="w-2.5 h-2.5" />
              PCC representado in listras preto/branco no mapa e nas barras
            </p>
          )}
          </motion.div>
        </div>
      </div>
    </motion.div>
  )
}
