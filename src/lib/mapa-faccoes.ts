/** Cor e rótulo da facção a partir dos dados AIP (sem duplicar cadastro). */
export function faccaoDisplay(apenado: {
  facaoRealNome?: string | null
  faccao?: string | null
}): string {
  return (apenado.facaoRealNome || apenado.faccao || 'Não identificado').trim()
}

/** Vermelho — Comando Vermelho no mapa e badges. */
export const COR_CV = '#dc2626'

/** Tom escuro do PCC em badges (no mapa usa listras preto/branco). */
export const COR_PCC_BADGE = '#111827'

const FACCAO_CORES: Record<string, string> = {
  PCC: COR_PCC_BADGE,
  CV: COR_CV,
  TCP: '#7c3aed',
  'PRIMEIRO COMANDO DO PANDA': '#f97316',
  'COMANDO CLASSE A': '#0891b2',
  'NAO IDENTIFICADO': '#6b7280',
}

export type FaccaoGrupoMapa = 'CV' | 'PCC'

export type FaccaoEstiloMapaTipo = 'solid' | 'striped' | 'split'

/** Uma facção do município, já com cor e participação — base do desenho por facção. */
export interface FaccaoBanda {
  /** Rótulo canônico exibível (ex.: "Comando Vermelho", "PCC", "TCP"). */
  label: string
  grupo: FaccaoGrupoMapa | 'OUTRO'
  cor: string
  /** PCC é desenhado com listras preto/branco em vez de cor sólida. */
  striped: boolean
  count: number
  /** Participação 0–1 no total de faccionados do município. */
  ratio: number
}

export interface FaccaoEstiloMapa {
  tipo: FaccaoEstiloMapaTipo
  predominanteGrupo: FaccaoGrupoMapa | 'OUTRO'
  predominanteLabel: string
  predominanteCor: string
  secundariaGrupo?: FaccaoGrupoMapa
  secundariaLabel?: string
  /** Fração 0–1 da área do grupo predominante. */
  ratioPredominante?: number
  cvCount: number
  pccCount: number
  /** Todas as facções do município, ordenadas desc por contagem. Fonte do desenho. */
  bandas: FaccaoBanda[]
}

/** Agrupa um rótulo livre (facaoRealNome/faccao) numa facção canônica p/ o mapa. */
function canonicalFaccao(nome: string): {
  chave: string
  label: string
  grupo: FaccaoGrupoMapa | 'OUTRO'
} {
  const grupo = normalizeFaccaoGrupo(nome)
  if (grupo === 'CV') return { chave: 'CV', label: 'Comando Vermelho', grupo: 'CV' }
  if (grupo === 'PCC') return { chave: 'PCC', label: 'PCC', grupo: 'PCC' }
  // Demais facções (TCP, Primeiro Comando do Panda, Comando Classe A, …): cada uma
  // é sua própria banda, agrupada pela chave normalizada para não fragmentar por
  // acento/caixa. NUNCA são absorvidas por CV/PCC.
  return { chave: normalizeFaccaoKey(nome), label: nome.trim() || 'Não identificado', grupo: 'OUTRO' }
}

function normalizeFaccaoKey(nome: string): string {
  return nome
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .trim()
}

/** Agrupa rótulos AIP/SIPE em CV ou PCC quando reconhecíveis. */
export function normalizeFaccaoGrupo(nome: string): FaccaoGrupoMapa | null {
  const key = normalizeFaccaoKey(nome)
  if (
    key.includes('PCC') ||
    key.includes('PRIMEIRO COMANDO DA CAPITAL') ||
    key.includes('PRIMEIRO COMANDO DO CAPITAL') ||
    key === 'PRIMEIRO COMANDO DA CAPITAL' ||
    (key.includes('PRIMEIRO COMANDO') && key.includes('CAPITAL'))
  ) {
    return 'PCC'
  }
  if (
    key === 'CV' ||
    key.startsWith('CV ') ||
    key.startsWith('CV-') ||
    key.endsWith(' CV') ||
    key.includes('COMANDO VERMELHO') ||
    (key.includes('COMANDO') && key.includes('VERMELHO'))
  ) {
    return 'CV'
  }
  return null
}

export function contarCvPcc(faccoes: Record<string, number>): { cv: number; pcc: number } {
  let cv = 0
  let pcc = 0
  for (const [nome, qtd] of Object.entries(faccoes)) {
    const g = normalizeFaccaoGrupo(nome)
    if (g === 'CV') cv += qtd
    else if (g === 'PCC') pcc += qtd
  }
  return { cv, pcc }
}

export function computeEstiloMapa(faccoes: Record<string, number>): FaccaoEstiloMapa {
  const { cv, pcc } = contarCvPcc(faccoes)

  // 1) Consolida os rótulos livres em bandas canônicas (CV, PCC, TCP, …), somando
  //    contagens de variações do mesmo grupo. Cada facção não-CV/PCC vira a própria
  //    banda com a própria cor — nunca é absorvida.
  const acc = new Map<string, FaccaoBanda>()
  let total = 0
  for (const [nome, qtd] of Object.entries(faccoes)) {
    if (!qtd || qtd <= 0) continue
    total += qtd
    const { chave, label, grupo } = canonicalFaccao(nome)
    const existente = acc.get(chave)
    if (existente) {
      existente.count += qtd
    } else {
      acc.set(chave, {
        label,
        grupo,
        cor: grupo === 'CV' ? COR_CV : grupo === 'PCC' ? COR_PCC_BADGE : faccaoCor(label),
        striped: grupo === 'PCC',
        count: qtd,
        ratio: 0,
      })
    }
  }

  const bandas = Array.from(acc.values()).sort((a, b) => b.count - a.count)
  for (const b of bandas) b.ratio = total > 0 ? b.count / total : 0

  if (bandas.length === 0) {
    return {
      tipo: 'solid',
      predominanteGrupo: 'OUTRO',
      predominanteLabel: 'Não identificado',
      predominanteCor: faccaoCor('Não identificado'),
      cvCount: cv,
      pccCount: pcc,
      bandas,
    }
  }

  // 2) O predominante é a MAIOR banda entre TODAS as facções (não só CV×PCC).
  //    Assim, 12 TCP + 4 PCC passa a ser TCP predominante, não mais "PCC listrado".
  const pred = bandas[0]
  const secundaria = bandas[1]

  // 3) tipo: 1 facção → sólido (ou listrado se PCC); 2+ → divisão proporcional.
  const tipo: FaccaoEstiloMapaTipo =
    bandas.length >= 2 ? 'split' : pred.grupo === 'PCC' ? 'striped' : 'solid'

  return {
    tipo,
    predominanteGrupo: pred.grupo,
    predominanteLabel: pred.label,
    predominanteCor: pred.cor,
    secundariaGrupo: secundaria && secundaria.grupo !== 'OUTRO' ? secundaria.grupo : undefined,
    secundariaLabel: secundaria?.label,
    ratioPredominante: pred.ratio,
    cvCount: cv,
    pccCount: pcc,
    bandas,
  }
}

export function faccaoCor(nome: string): string {
  const key = normalizeFaccaoKey(nome)
  if (FACCAO_CORES[key]) return FACCAO_CORES[key]
  if (key.includes('PCC')) return COR_PCC_BADGE
  if (key.includes('CV') || key.includes('COMANDO VERMELHO')) return COR_CV
  let hash = 0
  for (let i = 0; i < key.length; i++) hash = key.charCodeAt(i) + ((hash << 5) - hash)
  const hue = Math.abs(hash) % 360
  return `hsl(${hue}, 65%, 45%)`
}

export function intensidadeCor(total: number, max: number): string {
  if (max <= 0 || total <= 0) return '#e5e7eb'
  const t = Math.min(1, total / max)
  const r = Math.round(254 - t * 180)
  const g = Math.round(226 - t * 170)
  const b = Math.round(226 - t * 170)
  return `rgb(${r},${g},${b})`
}

/** ID estável de filtro (CV/PCC canônicos ou chave normalizada das demais). */
export function faccaoFiltroId(nome: string): string {
  const grupo = normalizeFaccaoGrupo(nome)
  if (grupo) return grupo
  return normalizeFaccaoKey(nome) || 'NAO_IDENTIFICADO'
}

export function matchesFaccaoFiltro(nome: string, filtroId: string): boolean {
  return faccaoFiltroId(nome) === filtroId
}

/** Ranking de facções a partir de contagens livres (chips de filtro / legendas). */
export function rankFaccoesGlobais(faccoes: Record<string, number>): FaccaoBanda[] {
  return computeEstiloMapa(faccoes).bandas
}

export function labelFaccaoFiltro(filtroId: string, bandas?: FaccaoBanda[]): string {
  if (filtroId === 'CV') return 'Comando Vermelho'
  if (filtroId === 'PCC') return 'PCC'
  const hit = bandas?.find((b) => faccaoFiltroId(b.label) === filtroId)
  return hit?.label ?? filtroId
}

/**
 * Recalcula stats de município filtrando por uma facção.
 * Mantém todos os municípios no array (total 0 = sem atuação da facção) para o mapa
 * continuar desenhando a malha completa — só a pintura/contagem muda.
 * Não altera dados de backend nem vínculos.
 */
export function aplicarFiltroFaccaoMunicipios<
  T extends {
    totalApenados: number
    faccoes: Record<string, number>
    estiloMapa: FaccaoEstiloMapa
    faccaoPredominante: string
    faccaoCor: string
    faccaoSecundaria?: string
  },
>(municipios: T[], filtroId: string | null): { municipios: T[]; maxApenados: number } {
  if (!filtroId) {
    const maxApenados = municipios.reduce((m, x) => Math.max(m, x.totalApenados), 0)
    return { municipios, maxApenados: Math.max(1, maxApenados) }
  }

  const filtrados = municipios.map((m) => {
    const faccoesFiltradas: Record<string, number> = {}
    for (const [nome, qtd] of Object.entries(m.faccoes ?? {})) {
      if (qtd > 0 && matchesFaccaoFiltro(nome, filtroId)) {
        faccoesFiltradas[nome] = qtd
      }
    }
    const totalApenados = Object.values(faccoesFiltradas).reduce((s, n) => s + n, 0)
    const estiloMapa = computeEstiloMapa(faccoesFiltradas)
    return {
      ...m,
      totalApenados,
      faccoes: faccoesFiltradas,
      estiloMapa,
      faccaoPredominante: totalApenados > 0 ? estiloMapa.predominanteLabel : '—',
      faccaoCor: totalApenados > 0 ? estiloMapa.predominanteCor : '#6b7280',
      faccaoSecundaria:
        estiloMapa.tipo === 'split' && estiloMapa.secundariaLabel
          ? estiloMapa.secundariaLabel
          : undefined,
    }
  })

  const maxApenados = filtrados.reduce((m, x) => Math.max(m, x.totalApenados), 0)
  return { municipios: filtrados, maxApenados: Math.max(1, maxApenados) }
}

export interface MunicipioStats {
  ibge: number | null
  nome: string
  totalApenados: number
  totalUnidades: number
  faccaoPredominante: string
  faccaoCor: string
  faccaoSecundaria?: string
  estiloMapa: FaccaoEstiloMapa
  faccoes: Record<string, number>
  unidades: string[]
}

export function agregarPorMunicipio(
  vinculos: Array<{
    municipio: string
    municipioIbge: number | null
    unidadePrisional: string
    aipApenado: { facaoRealNome?: string | null; faccao?: string | null }
  }>,
  resolveIbge?: (nome: string, ibge: number | null) => number | null
): MunicipioStats[] {
  const map = new Map<string, MunicipioStats>()

  for (const v of vinculos) {
    const nome = v.municipio
    let entry = map.get(nome)
    if (!entry) {
      entry = {
        ibge: v.municipioIbge ?? resolveIbge?.(nome, v.municipioIbge) ?? null,
        nome,
        totalApenados: 0,
        totalUnidades: 0,
        faccaoPredominante: 'Não identificado',
        faccaoCor: faccaoCor('Não identificado'),
        estiloMapa: computeEstiloMapa({}),
        faccoes: {},
        unidades: [],
      }
      map.set(nome, entry)
    }
    entry.totalApenados++
    if (!entry.unidades.includes(v.unidadePrisional)) {
      entry.unidades.push(v.unidadePrisional)
    }
    const f = faccaoDisplay(v.aipApenado)
    entry.faccoes[f] = (entry.faccoes[f] || 0) + 1
  }

  for (const entry of map.values()) {
    entry.totalUnidades = entry.unidades.length
    const estilo = computeEstiloMapa(entry.faccoes)
    entry.estiloMapa = estilo
    entry.faccaoPredominante = estilo.predominanteLabel
    entry.faccaoCor = estilo.predominanteCor
    if (estilo.tipo === 'split' && estilo.secundariaLabel) {
      entry.faccaoSecundaria = estilo.secundariaLabel
    }
  }

  return Array.from(map.values()).sort((a, b) => b.totalApenados - a.totalApenados)
}