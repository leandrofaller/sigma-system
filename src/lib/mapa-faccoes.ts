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

export interface FaccaoEstiloMapa {
  tipo: FaccaoEstiloMapaTipo
  predominanteGrupo: FaccaoGrupoMapa | 'OUTRO'
  predominanteLabel: string
  predominanteCor: string
  secundariaGrupo?: FaccaoGrupoMapa
  secundariaLabel?: string
  /** Fração 0–1 da área do grupo predominante (somente split CV+PCC). */
  ratioPredominante?: number
  cvCount: number
  pccCount: number
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

  if (cv > 0 && pcc > 0) {
    const total = cv + pcc
    const cvPred = cv >= pcc
    const pred = cvPred ? cv : pcc
    return {
      tipo: 'split',
      predominanteGrupo: cvPred ? 'CV' : 'PCC',
      predominanteLabel: cvPred ? 'Comando Vermelho' : 'PCC',
      predominanteCor: cvPred ? COR_CV : COR_PCC_BADGE,
      secundariaGrupo: cvPred ? 'PCC' : 'CV',
      secundariaLabel: cvPred ? 'PCC' : 'Comando Vermelho',
      ratioPredominante: pred / total,
      cvCount: cv,
      pccCount: pcc,
    }
  }

  if (pcc > 0) {
    return {
      tipo: 'striped',
      predominanteGrupo: 'PCC',
      predominanteLabel: 'PCC',
      predominanteCor: COR_PCC_BADGE,
      cvCount: cv,
      pccCount: pcc,
    }
  }

  if (cv > 0) {
    return {
      tipo: 'solid',
      predominanteGrupo: 'CV',
      predominanteLabel: 'Comando Vermelho',
      predominanteCor: COR_CV,
      cvCount: cv,
      pccCount: pcc,
    }
  }

  let max = 0
  let pred = 'Não identificado'
  for (const [f, c] of Object.entries(faccoes)) {
    if (c > max) {
      max = c
      pred = f
    }
  }

  return {
    tipo: 'solid',
    predominanteGrupo: 'OUTRO',
    predominanteLabel: pred,
    predominanteCor: faccaoCor(pred),
    cvCount: cv,
    pccCount: pcc,
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