/** Cor e rótulo da facção a partir dos dados AIP (sem duplicar cadastro). */
export function faccaoDisplay(apenado: {
  facaoRealNome?: string | null
  faccao?: string | null
}): string {
  return (apenado.facaoRealNome || apenado.faccao || 'Não identificado').trim()
}

const FACCAO_CORES: Record<string, string> = {
  PCC: '#dc2626',
  CV: '#2563eb',
  TCP: '#7c3aed',
  'PRIMEIRO COMANDO DO PANDA': '#f97316',
  'COMANDO CLASSE A': '#0891b2',
  'NAO IDENTIFICADO': '#6b7280',
}

export function faccaoCor(nome: string): string {
  const key = nome
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .trim()
  if (FACCAO_CORES[key]) return FACCAO_CORES[key]
  if (key.includes('PCC')) return FACCAO_CORES.PCC
  if (key.includes('CV') || key.includes('COMANDO VERMELHO')) return FACCAO_CORES.CV
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
    let max = 0
    let pred = 'Não identificado'
    for (const [f, c] of Object.entries(entry.faccoes)) {
      if (c > max) {
        max = c
        pred = f
      }
    }
    entry.faccaoPredominante = pred
    entry.faccaoCor = faccaoCor(pred)
  }

  return Array.from(map.values()).sort((a, b) => b.totalApenados - a.totalApenados)
}