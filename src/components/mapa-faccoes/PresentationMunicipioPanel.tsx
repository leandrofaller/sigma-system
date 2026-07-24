'use client'

import { motion } from 'framer-motion'
import { Users, Shield } from 'lucide-react'
import { faccaoCor } from '@/lib/mapa-faccoes'
import type { MunicipioMapStats } from './MapaFaccoesMap'
import { FaccaoMapaBadge } from './FaccaoMapaBadge'

interface Props {
  nome: string
  stat: MunicipioMapStats
  apenadosGeral: number
}

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.1, delayChildren: 0.15 } },
}

const fadeUp = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: 'easeOut' } },
}

export function PresentationMunicipioPanel({ nome, stat, apenadosGeral }: Props) {
  const faccoes = Object.entries(stat.faccoes ?? {}).sort((a, b) => b[1] - a[1])

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 12 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className="absolute bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-[22rem] bg-gray-950/92 backdrop-blur-md border border-white/10 rounded-2xl p-4 md:p-5 text-white shadow-2xl z-[1000]"
    >
      <p className="text-[10px] uppercase tracking-widest text-amber-400 font-bold">Modo apresentação</p>

      <motion.h3
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.05 }}
        className="text-2xl font-black leading-tight mt-1"
      >
        {nome}
      </motion.h3>

      <motion.div
        variants={stagger}
        initial="hidden"
        animate="show"
        className="mt-4 space-y-3"
      >
        <motion.div variants={fadeUp} className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Users className="w-4 h-4 text-blue-400 shrink-0" />
            <span className="text-sm text-gray-300">
              Presos nas unidades
              <span className="block text-[10px] text-gray-500 font-normal">Aba Unidades Prisionais</span>
            </span>
          </div>
          <span className="text-xl font-black tabular-nums text-blue-300 shrink-0">
            {apenadosGeral.toLocaleString('pt-BR')}
          </span>
        </motion.div>

        <motion.div variants={fadeUp} className="flex items-center justify-between gap-3 pt-3 border-t border-white/10">
          <div className="flex items-center gap-2 min-w-0">
            <Shield className="w-4 h-4 text-red-400 shrink-0" />
            <span className="text-sm text-gray-300">Faccionados mapeados</span>
          </div>
          <span className="text-xl font-black tabular-nums text-red-300 shrink-0">
            {stat.totalApenados.toLocaleString('pt-BR')}
          </span>
        </motion.div>

        {faccoes.length > 0 && (
          <motion.div variants={fadeUp} className="pt-3 border-t border-white/10">
            <p className="text-[10px] uppercase tracking-wider font-bold text-amber-400/90 mb-2.5">
              Por facção
            </p>
            <div className="space-y-2">
              {faccoes.map(([faccao, qtd], idx) => (
                <motion.div
                  key={faccao}
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.3, delay: 0.35 + idx * 0.07 }}
                  className="flex items-center justify-between gap-2"
                >
                  <FaccaoMapaBadge
                    label={faccao}
                    cor={faccaoCor(faccao)}
                    estiloMapa={stat.estiloMapa}
                    size="xs"
                  />
                  <span className="text-base font-black tabular-nums text-white shrink-0">
                    {qtd.toLocaleString('pt-BR')}
                  </span>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </motion.div>
    </motion.div>
  )
}