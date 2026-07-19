'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Loader2, X, AlertTriangle, TrendingUp, ShieldCheck, MapPin, Activity, Users, Award, Shield } from 'lucide-react'
import type { MunicipioMapStats } from './MapaFaccoesMap'
import { faccaoCor } from '@/lib/mapa-faccoes'

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
  porNivel?: { confirmado: number; suspeita: number; negado: number; naoInformado: number }
  porRelevancia?: { lideranca: number; relevancia: number; membro: number; exLideranca: number; naoInformado: number }
  porRegime?: Record<string, number>
  porSexo?: { masculino: number; feminino: number; naoInformado: number }
  liderancas?: Array<{
    id: string
    sipeId: number
    nome: string
    vulgo: string
    faccao: string
    unidade: string
    municipio: string
    relevancia: string
    nivel: string
    photoPath: string | null
  }>
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

  const getPhotoUrl = (path: string) => {
    if (path.startsWith('uploads/')) {
      return `/api/${path}`
    }
    return `/api/uploads/${path}`
  }

  return createPortal(
    <AnimatePresence>
      {open && (
        <div id="mapa-faccoes-relatorio-modal-portal" className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto">
          {/* Estilos embutidos para impressão em PDF de alta qualidade */}
          <style dangerouslySetInnerHTML={{ __html: `
            @media print {
              body {
                background: white !important;
                color: black !important;
                overflow: visible !important;
              }
              body > *:not(#mapa-faccoes-relatorio-modal-portal) {
                display: none !important;
              }
              #mapa-faccoes-relatorio-modal-portal {
                position: relative !important;
                display: block !important;
                left: auto !important;
                top: auto !important;
                width: 100% !important;
                height: auto !important;
                min-height: 0 !important;
                max-height: none !important;
                padding: 0 !important;
                margin: 0 !important;
                background: white !important;
                overflow: visible !important;
                z-index: auto !important;
              }
              #mapa-faccoes-relatorio-modal-container {
                position: relative !important;
                display: block !important;
                max-width: 100% !important;
                width: 100% !important;
                height: auto !important;
                max-height: none !important;
                overflow: visible !important;
                border: none !important;
                box-shadow: none !important;
                background: white !important;
                color: black !important;
                transform: none !important;
                padding: 0 !important;
                margin: 0 !important;
              }
              .no-print {
                display: none !important;
              }
              .print-border {
                border: 1px solid #d1d5db !important;
              }
              .print-bg {
                background-color: #f3f4f6 !important;
              }
              .text-white {
                color: black !important;
              }
              .text-subtle {
                color: #374151 !important;
              }
              h3, h4, th, td, span, div {
                color: black !important;
              }
            }
          `}} />

          {/* Fundo do modal que fecha ao clicar (apenas no modo tela) */}
          <div className="fixed inset-0 no-print" onClick={onClose} />

          <motion.div
            id="mapa-faccoes-relatorio-modal-container"
            initial={{ scale: 0.95, y: 8 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.95, y: 8 }}
            className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto border border-gray-200 dark:border-gray-800 z-10"
            onClick={(e) => e.stopPropagation()}
          >
            {/* CABEÇALHO */}
            <div className="p-6 border-b border-gray-150 dark:border-gray-850 flex justify-between items-start gap-4">
              <div className="flex items-start gap-3.5">
                <div className="p-2.5 bg-red-500/10 rounded-xl text-red-600 dark:text-red-500 shrink-0">
                  <Shield className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-xl font-black text-gray-900 dark:text-white uppercase tracking-tight">
                    {relatorio?.titulo ?? 'Relatório de Atuação de Facções'}
                  </h3>
                  <p className="text-xs text-subtle font-semibold tracking-wide uppercase mt-0.5">
                    {relatorio?.subtitulo ?? 'Sistema de Inteligência Penitenciária — SEJUS/RO'}
                  </p>
                  {relatorio?.geradoEm && (
                    <p className="text-[10px] text-subtle font-medium mt-1">
                      Gerado eletronicamente em {new Date(relatorio.geradoEm).toLocaleString('pt-BR')}
                    </p>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-subtle shrink-0 no-print transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* PROCESSAMENTO / LOADING */}
            {loading ? (
              <div className="p-16 flex flex-col items-center justify-center gap-3 text-subtle">
                <Loader2 className="w-8 h-8 animate-spin text-red-500" />
                <p className="text-sm font-semibold">Consolidando dados de inteligência...</p>
              </div>
            ) : error ? (
              <div className="p-12 flex flex-col items-center text-center gap-4">
                <AlertTriangle className="w-12 h-12 text-amber-500" />
                <p className="text-lg font-black text-gray-900 dark:text-white">Não foi possível carregar o relatório</p>
                <p className="text-sm text-subtle max-w-md">{error}</p>
                <button type="button" onClick={onClose} className="btn-secondary text-sm no-print px-6 py-2 rounded-lg">
                  Fechar
                </button>
              </div>
            ) : relatorio ? (
              <div id="mapa-faccoes-relatorio-modal-content" className="p-6 space-y-8 text-sm">
                
                {/* 1. CARDS KPI DE MÉTRIQUES CHAVE */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="rounded-xl bg-gray-50 dark:bg-gray-800/40 p-4 border border-gray-100 dark:border-gray-800 shadow-sm print-border print-bg">
                    <div className="flex items-center gap-2 text-subtle mb-1.5">
                      <Users className="w-4 h-4 text-gray-500" />
                      <p className="text-[10px] uppercase font-black tracking-wider">Mapeados</p>
                    </div>
                    <p className="text-3xl font-black text-gray-900 dark:text-white">
                      {relatorio.resumo?.totalVinculos ?? 0}
                    </p>
                    <div className="text-[10px] text-subtle font-medium mt-1">
                      {(relatorio as any).porNivel?.confirmado ?? 0} confirmados
                    </div>
                  </div>
                  
                  <div className="rounded-xl bg-gray-50 dark:bg-gray-800/40 p-4 border border-gray-100 dark:border-gray-800 shadow-sm print-border print-bg">
                    <div className="flex items-center gap-2 text-subtle mb-1.5">
                      <Award className="w-4 h-4 text-red-500" />
                      <p className="text-[10px] uppercase font-black tracking-wider">Lideranças</p>
                    </div>
                    <p className="text-3xl font-black text-red-600 dark:text-red-500">
                      {relatorio.liderancas?.length ?? 0}
                    </p>
                    <div className="text-[10px] text-subtle font-medium mt-1">
                      custodiados mapeados
                    </div>
                  </div>

                  <div className="rounded-xl bg-gray-50 dark:bg-gray-800/40 p-4 border border-gray-100 dark:border-gray-800 shadow-sm print-border print-bg">
                    <div className="flex items-center gap-2 text-subtle mb-1.5">
                      <MapPin className="w-4 h-4 text-gray-500" />
                      <p className="text-[10px] uppercase font-black tracking-wider">Municípios</p>
                    </div>
                    <p className="text-3xl font-black text-gray-900 dark:text-white">
                      {relatorio.resumo?.municipiosAfetados ?? 0}
                    </p>
                    <div className="text-[10px] text-subtle font-medium mt-1">
                      com atuação ativa
                    </div>
                  </div>

                  <div className="rounded-xl bg-gray-50 dark:bg-gray-800/40 p-4 border border-gray-100 dark:border-gray-800 shadow-sm print-border print-bg">
                    <div className="flex items-center gap-2 text-subtle mb-1.5">
                      <Activity className="w-4 h-4 text-gray-500" />
                      <p className="text-[10px] uppercase font-black tracking-wider">Unidades</p>
                    </div>
                    <p className="text-3xl font-black text-gray-900 dark:text-white">
                      {relatorio.resumo?.unidadesComFaccionados ?? 0}
                    </p>
                    <div className="text-[10px] text-subtle font-medium mt-1">
                      prisionais afetadas
                    </div>
                  </div>
                </div>

                {/* 2. DADOS ANALÍTICOS DE INTELIGÊNCIA EM DUAS COLUNAS */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  
                  {/* COLUNA ESQUERDA: RANKING E CONFIABILIDADE */}
                  <div className="space-y-6">
                    {/* Ranking das Facções */}
                    {relatorio.faccoesRanking && (
                      <div className="rounded-xl bg-white dark:bg-gray-900 border border-gray-150 dark:border-gray-800/70 p-5 shadow-sm print-border">
                        <h4 className="font-bold text-sm uppercase tracking-wider mb-4 text-gray-900 dark:text-white flex items-center gap-2">
                          <TrendingUp className="w-4 h-4 text-red-500" />
                          <span>Distribuição por Facção</span>
                        </h4>
                        <div className="space-y-3.5">
                          {relatorio.faccoesRanking.map((f) => {
                            const totalVinc = relatorio.resumo?.totalVinculos ?? 1
                            const pct = Math.round((f.total / totalVinc) * 100)
                            return (
                              <div key={f.nome} className="space-y-1">
                                <div className="flex justify-between items-center text-xs">
                                  <span className="font-semibold text-gray-700 dark:text-gray-300">{f.nome}</span>
                                  <span className="font-black text-gray-900 dark:text-white">
                                    {f.total} <span className="text-[10px] text-subtle font-normal">({pct}%)</span>
                                  </span>
                                </div>
                                <div className="h-2 w-full bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                                  <div 
                                    className="h-full rounded-full transition-all duration-500" 
                                    style={{ 
                                      width: `${pct}%`,
                                      backgroundColor: faccaoCor(f.nome)
                                    }}
                                  />
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}

                    {/* Confiabilidade do Mapeamento (Nível de Certeza) */}
                    {relatorio.porNivel && (
                      <div className="rounded-xl bg-white dark:bg-gray-900 border border-gray-150 dark:border-gray-800/70 p-5 shadow-sm print-border">
                        <h4 className="font-bold text-sm uppercase tracking-wider mb-4 text-gray-900 dark:text-white flex items-center gap-2">
                          <ShieldCheck className="w-4 h-4 text-emerald-500" />
                          <span>Grau de Confirmação</span>
                        </h4>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-3">
                            <div className="text-xs">
                              <div className="flex justify-between font-bold text-emerald-600 dark:text-emerald-500 mb-1">
                                <span>Confirmado</span>
                                <span>{relatorio.porNivel.confirmado}</span>
                              </div>
                              <div className="h-1.5 w-full bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                                <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${Math.round((relatorio.porNivel.confirmado / (relatorio.resumo?.totalVinculos || 1)) * 100)}%` }} />
                              </div>
                            </div>
                            <div className="text-xs">
                              <div className="flex justify-between font-bold text-amber-600 dark:text-amber-500 mb-1">
                                <span>Suspeita</span>
                                <span>{relatorio.porNivel.suspeita}</span>
                              </div>
                              <div className="h-1.5 w-full bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                                <div className="h-full bg-amber-500 rounded-full" style={{ width: `${Math.round((relatorio.porNivel.suspeita / (relatorio.resumo?.totalVinculos || 1)) * 100)}%` }} />
                              </div>
                            </div>
                          </div>
                          
                          <div className="space-y-3">
                            <div className="text-xs">
                              <div className="flex justify-between font-bold text-red-600 dark:text-red-500 mb-1">
                                <span>Negado</span>
                                <span>{relatorio.porNivel.negado}</span>
                              </div>
                              <div className="h-1.5 w-full bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                                <div className="h-full bg-red-500 rounded-full" style={{ width: `${Math.round((relatorio.porNivel.negado / (relatorio.resumo?.totalVinculos || 1)) * 100)}%` }} />
                              </div>
                            </div>
                            <div className="text-xs">
                              <div className="flex justify-between font-bold text-gray-500 mb-1">
                                <span>Não Informado</span>
                                <span>{relatorio.porNivel.naoInformado}</span>
                              </div>
                              <div className="h-1.5 w-full bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                                <div className="h-full bg-gray-400 rounded-full" style={{ width: `${Math.round((relatorio.porNivel.naoInformado / (relatorio.resumo?.totalVinculos || 1)) * 100)}%` }} />
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* COLUNA DIREITA: REGIMES E DEMOGRAFIA */}
                  <div className="space-y-6">
                    {/* Perfil Prisional (Regimes) */}
                    {relatorio.porRegime && (
                      <div className="rounded-xl bg-white dark:bg-gray-900 border border-gray-150 dark:border-gray-800/70 p-5 shadow-sm print-border">
                        <h4 className="font-bold text-sm uppercase tracking-wider mb-4 text-gray-900 dark:text-white flex items-center gap-2">
                          <Activity className="w-4 h-4 text-blue-500" />
                          <span>Custódia por Regime</span>
                        </h4>
                        <div className="space-y-3.5">
                          {Object.entries(relatorio.porRegime).sort((a, b) => b[1] - a[1]).map(([regime, total]) => {
                            const pct = Math.round((total / (relatorio.resumo?.totalVinculos || 1)) * 100)
                            return (
                              <div key={regime} className="space-y-1">
                                <div className="flex justify-between items-center text-xs">
                                  <span className="font-semibold text-gray-700 dark:text-gray-300">{regime}</span>
                                  <span className="font-black text-gray-900 dark:text-white">
                                    {total} <span className="text-[10px] text-subtle font-normal">({pct}%)</span>
                                  </span>
                                </div>
                                <div className="h-2 w-full bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                                  <div className="h-full bg-blue-500 dark:bg-blue-600 rounded-full" style={{ width: `${pct}%` }} />
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}

                    {/* Distribuição por Gênero */}
                    {relatorio.porSexo && (
                      <div className="rounded-xl bg-white dark:bg-gray-900 border border-gray-150 dark:border-gray-800/70 p-5 shadow-sm print-border">
                        <h4 className="font-bold text-sm uppercase tracking-wider mb-4 text-gray-900 dark:text-white flex items-center gap-2">
                          <Users className="w-4 h-4 text-sky-500" />
                          <span>Perfil de Gênero</span>
                        </h4>
                        <div className="space-y-3">
                          <div className="text-xs">
                            <div className="flex justify-between font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                              <span>Masculino</span>
                              <span>{relatorio.porSexo.masculino} <span className="text-subtle font-normal">({Math.round((relatorio.porSexo.masculino / (relatorio.resumo?.totalVinculos || 1)) * 100)}%)</span></span>
                            </div>
                            <div className="h-2.5 w-full bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                              <div className="h-full bg-sky-500 dark:bg-sky-600 rounded-full" style={{ width: `${Math.round((relatorio.porSexo.masculino / (relatorio.resumo?.totalVinculos || 1)) * 100)}%` }} />
                            </div>
                          </div>
                          <div className="text-xs">
                            <div className="flex justify-between font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                              <span>Feminino</span>
                              <span>{relatorio.porSexo.feminino} <span className="text-subtle font-normal">({Math.round((relatorio.porSexo.feminino / (relatorio.resumo?.totalVinculos || 1)) * 100)}%)</span></span>
                            </div>
                            <div className="h-2.5 w-full bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                              <div className="h-full bg-pink-500 dark:bg-pink-600 rounded-full" style={{ width: `${Math.round((relatorio.porSexo.feminino / (relatorio.resumo?.totalVinculos || 1)) * 100)}%` }} />
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* 3. DISTRIBUIÇÃO HIERÁRQUICA */}
                {relatorio.porRelevancia && (
                  <div className="rounded-xl bg-white dark:bg-gray-900 border border-gray-150 dark:border-gray-800 p-5 shadow-sm print-border">
                    <h4 className="font-bold text-sm uppercase tracking-wider mb-4 text-gray-900 dark:text-white flex items-center gap-2">
                      <Shield className="w-4 h-4 text-amber-500" />
                      <span>Hierarquia Penitenciária Mapeada</span>
                    </h4>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                      <div className="bg-gray-50 dark:bg-gray-800/40 p-4 rounded-xl border border-gray-100 dark:border-gray-800 print-bg">
                        <span className="text-3xl font-black text-red-600 dark:text-red-500">{relatorio.porRelevancia.lideranca}</span>
                        <p className="text-[10px] text-subtle font-extrabold uppercase mt-1 tracking-wider">Lideranças</p>
                      </div>
                      <div className="bg-gray-50 dark:bg-gray-800/40 p-4 rounded-xl border border-gray-100 dark:border-gray-800 print-bg">
                        <span className="text-3xl font-black text-amber-600 dark:text-amber-500">{relatorio.porRelevancia.relevancia}</span>
                        <p className="text-[10px] text-subtle font-extrabold uppercase mt-1 tracking-wider">Relevância</p>
                      </div>
                      <div className="bg-gray-50 dark:bg-gray-800/40 p-4 rounded-xl border border-gray-100 dark:border-gray-800 print-bg">
                        <span className="text-3xl font-black text-blue-600 dark:text-blue-500">{relatorio.porRelevancia.membro}</span>
                        <p className="text-[10px] text-subtle font-extrabold uppercase mt-1 tracking-wider">Membros</p>
                      </div>
                      <div className="bg-gray-50 dark:bg-gray-800/40 p-4 rounded-xl border border-gray-100 dark:border-gray-800 print-bg">
                        <span className="text-3xl font-black text-gray-600 dark:text-gray-400">{relatorio.porRelevancia.exLideranca}</span>
                        <p className="text-[10px] text-subtle font-extrabold uppercase mt-1 tracking-wider">Ex-Lideranças</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* 4. ATUAÇÃO POR MUNICÍPIOS E UNIDADES */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Municípios */}
                  <div className="rounded-xl bg-white dark:bg-gray-900 border border-gray-150 dark:border-gray-800 p-5 shadow-sm print-border">
                    <h4 className="font-bold text-sm uppercase tracking-wider mb-3 text-gray-900 dark:text-white flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-red-500" />
                      <span>Distribuição por Município</span>
                    </h4>
                    {(relatorio.topMunicipios?.length ?? 0) === 0 ? (
                      <p className="text-subtle text-xs">Nenhum município mapeado.</p>
                    ) : (
                      <div className="divide-y divide-gray-100 dark:divide-gray-800">
                        {relatorio.topMunicipios!.map((m) => (
                          <div key={m.nome} className="py-2.5 flex justify-between items-center gap-2 text-xs">
                            <span className="font-semibold text-gray-700 dark:text-gray-300">{m.nome}</span>
                            <div className="flex items-center gap-3">
                              {/* Divisão percentual interna do município */}
                              <div className="flex gap-2 text-[10px] font-bold text-subtle">
                                {Object.entries(m.faccoes ?? {}).sort((a, b) => b[1] - a[1]).map(([fac, count]) => (
                                  <span key={fac} style={{ color: faccaoCor(fac) }}>
                                    {count}{fac.split(' ')[0][0]}
                                  </span>
                                ))}
                              </div>
                              <span className="font-bold px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white">
                                {m.totalApenados}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Unidades */}
                  <div className="rounded-xl bg-white dark:bg-gray-900 border border-gray-150 dark:border-gray-800 p-5 shadow-sm print-border">
                    <h4 className="font-bold text-sm uppercase tracking-wider mb-3 text-gray-900 dark:text-white flex items-center gap-2">
                      <Activity className="w-4 h-4 text-blue-500" />
                      <span>Distribuição por Unidade</span>
                    </h4>
                    {(relatorio.topUnidades?.length ?? 0) === 0 ? (
                      <p className="text-subtle text-xs">Nenhuma unidade mapeada.</p>
                    ) : (
                      <div className="divide-y divide-gray-100 dark:divide-gray-800">
                        {relatorio.topUnidades!.map((u) => (
                          <div key={`${u.unidade}-${u.municipio}`} className="py-2.5 flex justify-between items-center gap-2 text-xs">
                            <span className="font-semibold text-gray-700 dark:text-gray-300 truncate max-w-[65%]" title={u.unidade}>
                              {u.unidade} <span className="text-[10px] font-normal text-subtle">({u.municipio})</span>
                            </span>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="text-[10px] font-extrabold" style={{ color: faccaoCor(u.faccaoPredominante) }}>
                                {u.faccaoPredominante}
                              </span>
                              <span className="font-bold px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white">
                                {u.total}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* 5. QUADRO DE LIDERANÇAS CUSTODIADAS */}
                {relatorio.liderancas && relatorio.liderancas.length > 0 && (
                  <div className="rounded-xl bg-white dark:bg-gray-900 border border-gray-150 dark:border-gray-800 p-5 shadow-sm print-border">
                    <h4 className="font-bold text-sm uppercase tracking-wider mb-4 text-gray-900 dark:text-white flex items-center gap-2">
                      <Award className="w-4 h-4 text-red-500" />
                      <span>Quadro de Lideranças Custodiadas</span>
                    </h4>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="border-b border-gray-200 dark:border-gray-800 text-subtle font-bold">
                            <th className="py-2 pr-2">Apenado / Vulgo</th>
                            <th className="py-2">Facção</th>
                            <th className="py-2">Local de Custódia</th>
                            <th className="py-2">Confirmação</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                          {relatorio.liderancas.map((l) => (
                            <tr key={l.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/30">
                              <td className="py-2.5 pr-2">
                                <div className="flex items-center gap-2.5">
                                  {l.photoPath ? (
                                    <img 
                                      src={getPhotoUrl(l.photoPath)} 
                                      alt={l.nome} 
                                      className="w-8 h-8 rounded-full object-cover border border-gray-200 dark:border-gray-700 shrink-0" 
                                    />
                                  ) : (
                                    <div 
                                      className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-[10px] text-white shrink-0"
                                      style={{ backgroundColor: faccaoCor(l.faccao) }}
                                    >
                                      {l.nome.substring(0, 2).toUpperCase()}
                                    </div>
                                  )}
                                  <div>
                                    <div className="font-bold text-gray-900 dark:text-white">{l.nome}</div>
                                    <div className="text-[10px] text-red-600 dark:text-red-500 font-bold uppercase">Vulgo: {l.vulgo}</div>
                                  </div>
                                </div>
                              </td>
                              <td className="py-2.5">
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold inline-block" style={{ backgroundColor: `${faccaoCor(l.faccao)}20`, color: faccaoCor(l.faccao) }}>
                                  {l.faccao}
                                </span>
                              </td>
                              <td className="py-2.5">
                                <div className="font-semibold text-gray-700 dark:text-gray-300">{l.unidade}</div>
                                <div className="text-[10px] text-subtle">{l.municipio}</div>
                              </td>
                              <td className="py-2.5">
                                <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                                  l.nivel.toLowerCase().includes('confirm') 
                                    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-400' 
                                    : 'bg-amber-50 text-amber-700 dark:bg-amber-950/20 dark:text-amber-400'
                                }`}>
                                  {l.nivel}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* 6. QUADRO DE ASSINATURA PARA IMPRESSÃO */}
                <div className="hidden print:block pt-16 text-center text-xs">
                  <div className="flex justify-around">
                    <div>
                      <div className="w-56 border-b border-gray-400 mx-auto mb-1"></div>
                      <p className="font-bold">Analista de Inteligência</p>
                      <p className="text-subtle">SEJUS/RO</p>
                    </div>
                    <div>
                      <div className="w-56 border-b border-gray-400 mx-auto mb-1"></div>
                      <p className="font-bold">Diretor de Inteligência Penitenciária</p>
                      <p className="text-subtle">SEJUS/RO</p>
                    </div>
                  </div>
                </div>

                {/* BOTÃO DE IMPRESSÃO */}
                <button 
                  type="button" 
                  onClick={() => window.print()} 
                  className="btn-primary w-full no-print py-3 font-bold shadow-md hover:shadow-lg transition-all rounded-xl text-center bg-red-600 hover:bg-red-700 text-white"
                >
                  Imprimir Relatório Executivo / Gerar PDF
                </button>
              </div>
            ) : (
              <div className="p-12 text-center text-subtle text-sm">Nenhum dado disponível.</div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  )
}