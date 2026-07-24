'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Users, Shield, Building2, X, MapPin, Sparkles } from 'lucide-react'
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
      <div className="pointer-events-auto relative mx-auto max-w-4xl overflow-hidden rounded-3xl border border-white/15 bg-gradient-to-br from-slate-950/96 via-slate-900/95 to-slate-950/96 shadow-[0_25px_80px_-12px_rgba(0,0,0,0.85)] backdrop-blur-xl">
        {/* Accent line */}
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-amber-400 via-red-500 to-violet-500" />

        {/* Soft glow blobs */}
        <div className="pointer-events-none absolute -top-20 -right-16 h-48 w-48 rounded-full bg-red-500/15 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-16 -left-12 h-40 w-40 rounded-full bg-amber-400/10 blur-3xl" />

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
            </div>
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="shrink-0 p-2 rounded-xl bg-white/5 hover:bg-white/15 text-gray-300 hover:text-white border border-white/10 transition-colors"
                aria-label="Fechar destaque"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <motion.div
            variants={stagger}
            initial="hidden"
            animate="show"
            className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-3"
          >
            <motion.div
              variants={fadeUp}
              className="rounded-2xl border border-blue-500/20 bg-blue-500/10 px-4 py-3 flex items-center justify-between gap-3"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="p-2 rounded-xl bg-blue-500/20 text-blue-300">
                  <Building2 className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-wider font-bold text-gray-400">
                    Presos nas unidades
                  </p>
                  <p className="text-[11px] text-gray-500 truncate">
                    Só unidade identificada
                    {unidadesPresos.length > 0
                      ? ` · ${unidadesPresos.length} unid.`
                      : ''}
                  </p>
                </div>
              </div>
              <p className="text-2xl font-black text-blue-300 shrink-0">
                <AnimatedCount value={totalPresosUnidades} />
              </p>
            </motion.div>

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

          {unidadesPresos.length > 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.28 }}
              className="mt-4 pt-4 border-t border-white/10"
            >
              <p className="text-[10px] uppercase tracking-[0.18em] font-black text-blue-400/90 mb-3">
                Por unidade identificada
              </p>
              <div className="space-y-2 max-h-[18vh] overflow-y-auto pr-1">
                {unidadesPresos.map((u, idx) => {
                  const pct = Math.round((u.totalApenados / maxUnidade) * 100)
                  return (
                    <motion.div
                      key={u.unidade}
                      initial={{ opacity: 0, x: -12 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.35, delay: 0.3 + idx * 0.06 }}
                    >
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <p className="text-xs text-gray-200 font-medium leading-snug line-clamp-2 min-w-0">
                          {u.unidade}
                        </p>
                        <span className="text-sm font-black tabular-nums text-blue-300 shrink-0">
                          <AnimatedCount value={u.totalApenados} delay={280 + idx * 50} />
                        </span>
                      </div>
                      <div className="h-1.5 rounded-full bg-white/5 overflow-hidden ring-1 ring-white/10">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${pct}%` }}
                          transition={{
                            duration: 0.7,
                            delay: 0.32 + idx * 0.06,
                            ease: [0.22, 1, 0.36, 1],
                          }}
                          className="h-full rounded-full bg-gradient-to-r from-blue-600 to-sky-400"
                          style={{ boxShadow: '0 0 12px rgba(56, 189, 248, 0.35)' }}
                        />
                      </div>
                    </motion.div>
                  )
                })}
              </div>
            </motion.div>
          )}

          {faccoes.length > 0 ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.35 }}
              className="mt-5 pt-4 border-t border-white/10"
            >
              <p className="text-[10px] uppercase tracking-[0.18em] font-black text-amber-400/90 mb-3">
                Atuação por facção
              </p>
              <div className="space-y-3 max-h-[28vh] overflow-y-auto pr-1">
                {faccoes.map(([faccao, qtd], idx) => {
                  const cor = faccaoCor(faccao)
                  const banda = bandas.find((b) => b.label === faccao)
                  const striped = banda?.striped ?? false
                  const pct = Math.round((qtd / maxFac) * 100)
                  const share =
                    stat.totalApenados > 0
                      ? Math.round((qtd / stat.totalApenados) * 100)
                      : 0

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
                      <div className="h-2.5 rounded-full bg-white/5 overflow-hidden ring-1 ring-white/10">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${pct}%` }}
                          transition={{
                            duration: 0.85,
                            delay: 0.45 + idx * 0.12,
                            ease: [0.22, 1, 0.36, 1],
                          }}
                          className="h-full rounded-full relative"
                          style={{
                            background: striped
                              ? 'repeating-linear-gradient(45deg,#0a0a0a,#0a0a0a 4px,#f8fafc 4px,#f8fafc 8px)'
                              : `linear-gradient(90deg, ${cor}cc, ${cor})`,
                            boxShadow: striped
                              ? '0 0 12px rgba(248,250,252,0.25)'
                              : `0 0 16px ${cor}66`,
                          }}
                        />
                      </div>
                    </motion.div>
                  )
                })}
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
              PCC representado em listras preto/branco no mapa e nas barras
            </p>
          )}
        </div>
      </div>
    </motion.div>
  )
}
