import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { scrapeUnidadesPrisionais } from '@/lib/sipe-scraper'

// ── Cache (globalThis sobrevive ao isolamento de módulos do Next.js) ──────────
declare global {
  // eslint-disable-next-line no-var
  var __sipeUnidadesCache: { data: Array<{ id: string; nome: string }>; fetchedAt: number } | null
}
globalThis.__sipeUnidadesCache = globalThis.__sipeUnidadesCache ?? null

const CACHE_TTL_MS = 24 * 60 * 60 * 1000 // 24 horas
const SIPE_URL = 'https://sipe.sejus.ro.gov.br'

// Lista estática de fallback — usada apenas quando o banco estiver vazio e o SIPE inacessível
const UNIDADES_FALLBACK: Array<{ id: string; nome: string }> = [
  { id: '3',  nome: 'CDPPVH - Centro de Detenção Provisório de Porto Velho' },
  { id: '1',  nome: 'PANDA - Penitenciária Edvan Mariano Rosendo' },
  { id: '5',  nome: 'Penitenciária Estadual Suely Maria Mendonça' },
  { id: '6',  nome: 'UPES - Unidade Provisória de Segurança Especial' },
  { id: '9',  nome: 'CAPEP I - Colônia Agrícola Penal Ênio Pinheiro' },
  { id: '16', nome: 'PEA - Penitenciária Estadual Aruana' },
  { id: '17', nome: 'Penitenciária Milton Soares de Carvalho' },
  { id: '91', nome: 'Penitenciária Jorge Thiago Aguiar Afonso' },
  { id: '12', nome: 'CRVG - Centro de Ressocialização Vale do Guaporé' },
  { id: '25', nome: 'Centro de Ressocialização Jonas Ferreti' },
]

async function getCachedUnitsFromDb(): Promise<Array<{ id: string; nome: string }> | null> {
  try {
    const config = await prisma.systemConfig.findUnique({
      where: { key: 'sipe_unidades' },
    })
    if (config && Array.isArray(config.value)) {
      return config.value as Array<{ id: string; nome: string }>
    }
  } catch {}
  return null
}

export async function GET(_req: NextRequest) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  // Serve do cache em memória se ainda válido
  const cache = globalThis.__sipeUnidadesCache
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    return NextResponse.json({ unidades: cache.data, fromSipe: true, fromCache: true })
  }

  const cpf = process.env.SIPE_CPF ?? ''
  const senha = process.env.SIPE_SENHA ?? ''

  // Sem credenciais configuradas → tenta carregar do cache do banco, senão fallback estático
  if (!cpf || !senha) {
    const dbUnits = await getCachedUnitsFromDb()
    if (dbUnits && dbUnits.length > 0) {
      return NextResponse.json({ unidades: dbUnits, fromSipe: true, fromCache: true })
    }
    return NextResponse.json({ unidades: UNIDADES_FALLBACK, fromSipe: false, fromCache: false })
  }

  try {
    const unidades = await scrapeUnidadesPrisionais()
    return NextResponse.json({ unidades, fromSipe: true, fromCache: false })
  } catch {
    // Falhou no scrape (ex: SIPE fora do ar) → tenta carregar do cache do banco, senão fallback estático
    const dbUnits = await getCachedUnitsFromDb()
    if (dbUnits && dbUnits.length > 0) {
      return NextResponse.json({ unidades: dbUnits, fromSipe: true, fromCache: true })
    }
    return NextResponse.json({ unidades: UNIDADES_FALLBACK, fromSipe: false, fromCache: false })
  }
}
