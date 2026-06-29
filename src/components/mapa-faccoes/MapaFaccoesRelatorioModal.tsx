'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Loader2, X, AlertTriangle } from 'lucide-react'
import type { MunicipioMapStats } from './MapaFaccoesMap'

const RESUMO_LABELS: Record<string, string> = {
  totalVinculos: 'Faccionados mapeados',
  municipiosAfetados: 'Municípios afetados',
  unidadesComFaccionados: 'Unidades com faccionados',
  faccoesIdentificadas: 'Facções identificadas',
}

interface RelatorioPayload {
  titulo?: string
  subtitulo?: string
  geradoEm?: string
  resumo?: Record<string, number>
  topMunicipios?: MunicipioMapStats[]
  topUnidades?: {
    unidade: string
    municipio: string
    total: number
    faccaoPredominante: string
  }[]
  faccoesRanking?: { nome: string; total: number }[]
}

interface Props {
  open: boolean
  onClose: () => void
}

export function MapaFaccoesRelatorioModal({ open, onClose }: Props) {
  const [mounted, setMounted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [relatorio, setRelatorio] = useState<RelatorioPayload | null>(null)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!open) return

    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    let cancelled = false
    setLoading(true)
    setError(null)
    setRelatorio(null)

    fetch('/api/mapa-faccoes/relatorio')
      .then(async (res) => {
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Erro ao gerar relatório')
        if (!cancelled) setRelatorio(data)
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Erro ao carregar relatório')
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
      document.body.style.overflow = prev
    }
  }, [open])

  if (!mounted) return null

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.95, y: 8 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.95, y: 8 }}
            className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto border border-gray-200 dark:border-gray-700"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-5 border-b border-gray-200 dark:border-gray-700 flex justify-between items-start gap-3">
              <div>
                <h3 className="text-lg font-black text-gray-900 dark:text-white">
                  {relatorio?.titulo ?? 'Relatório executivo'}
                </h3>
                <p className="text-xs text-subtle mt-0.5">
                  {relatorio?.subtitulo ?? 'Unidades com faccionados · quantitativos · facção predominante'}
                </p>
                {relatorio?.geradoEm && (
                  <p className="text-[10px] text-subtle mt-1">
                    Gerado em {new Date(relatorio.geradoEm).toLocaleString('pt-BR')}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={onClose}
                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-subtle shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {loading ? (
              <div className="p-10 flex flex-col items-center justify-center gap-2 text-subtle">
                <Loader2 className="w-7 h-7 animate-spin text-red-500" />
                <p className="text-sm">Gerando relatório...</p>
              </div>
            ) : error ? (
              <div className="p-8 flex flex-col items-center text-center gap-3">
                <AlertTriangle className="w-10 h-10 text-amber-500" />
                <p className="font-semibold text-gray-900 dark:text-white">Não foi possível carregar o relatório</p>
                <p className="text-sm text-subtle max-w-sm">{error}</p>
                <button type="button" onClick={onClose} className="btn-secondary text-sm mt-2">
                  Fechar
                </button>
              </div>
            ) : relatorio ? (
              <div className="p-5 space-y-6 text-sm">
                <div className="grid grid-cols-2 gap-3">
                  {Object.entries(relatorio.resumo ?? {}).map(([k, v]) => (
                    <div key={k} className="rounded-lg bg-gray-50 dark:bg-gray-800 p-3">
                      <p className="text-[10px] uppercase text-subtle font-bold">
                        {RESUMO_LABELS[k] ?? k}
                      </p>
                      <p className="text-xl font-black text-gray-900 dark:text-white">{v}</p>
                    </div>
                  ))}
                </div>

                {(relatorio.faccoesRanking?.length ?? 0) > 0 && (
                  <div>
                    <h4 className="font-bold mb-2 text-gray-900 dark:text-white">Ranking de facções</h4>
                    <div className="space-y-1">
                      {relatorio.faccoesRanking!.slice(0, 8).map((f) => (
                        <div
                          key={f.nome}
                          className="flex justify-between items-center py-1 border-b border-gray-100 dark:border-gray-800"
                        >
                          <span>{f.nome}</span>
                          <span className="font-bold">{f.total}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <h4 className="font-bold mb-2 text-gray-900 dark:text-white">Top municípios</h4>
                  {(relatorio.topMunicipios?.length ?? 0) === 0 ? (
                    <p className="text-subtle text-xs">Nenhum município com faccionados mapeados.</p>
                  ) : (
                    <div className="space-y-1">
                      {relatorio.topMunicipios!.slice(0, 8).map((m) => (
                        <div
                          key={m.nome}
                          className="flex justify-between items-center gap-2 py-1 border-b border-gray-100 dark:border-gray-800"
                        >
                          <span className="truncate">{m.nome}</span>
                          <span className="font-bold shrink-0" style={{ color: m.faccaoCor }}>
                            {m.totalApenados} · {m.faccaoPredominante}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <h4 className="font-bold mb-2 text-gray-900 dark:text-white">Unidades com maior incidência</h4>
                  {(relatorio.topUnidades?.length ?? 0) === 0 ? (
                    <p className="text-subtle text-xs">Nenhuma unidade com vínculos registrados.</p>
                  ) : (
                    <div className="space-y-1">
                      {relatorio.topUnidades!.slice(0, 8).map((u) => (
                        <div
                          key={`${u.unidade}-${u.municipio}`}
                          className="flex justify-between gap-2 py-1 border-b border-gray-100 dark:border-gray-800 text-xs"
                        >
                          <span className="truncate max-w-[60%]">
                            {u.unidade} <span className="text-subtle">({u.municipio})</span>
                          </span>
                          <span className="font-bold shrink-0">
                            {u.total} · {u.faccaoPredominante}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <button type="button" onClick={() => window.print()} className="btn-primary w-full">
                  Imprimir / PDF
                </button>
              </div>
            ) : (
              <div className="p-8 text-center text-subtle text-sm">Nenhum dado disponível.</div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  )
}