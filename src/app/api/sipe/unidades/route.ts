import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { chromium } from 'playwright'
import { existsSync } from 'fs'
import { prisma } from '@/lib/db'

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

function findSystemChromium(): string | undefined {
  if (process.env.PLAYWRIGHT_EXECUTABLE_PATH) return process.env.PLAYWRIGHT_EXECUTABLE_PATH

  const candidates = [
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/google-chrome',
    '/snap/bin/chromium',
    '/usr/local/bin/chromium',
  ]
  return candidates.find(existsSync)
}

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

  let browser = null
  try {
    const executablePath = findSystemChromium()
    browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-extensions',
      ],
      ...(executablePath ? { executablePath } : {}),
    })

    const page = await browser.newPage()

    // Login
    await page.goto(`${SIPE_URL}/`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
    await page.waitForSelector('input[type="password"]', { timeout: 30_000 })

    const cpfInput =
      (await page.$('input[placeholder*="CPF"]')) ??
      (await page.$('input[name*="cpf"], input[name*="login"], input[type="text"]'))
    if (!cpfInput) throw new Error('Campo CPF não encontrado na página de login')

    await cpfInput.fill(cpf)
    await page.fill('input[type="password"]', senha)

    const submitBtn =
      (await page.$('button[type="submit"]')) ??
      (await page.$('input[type="submit"]')) ??
      (await page.$('button'))
    if (!submitBtn) throw new Error('Botão de submit não encontrado')
    await submitBtn.click()

    // Aguarda página de seleção de perfil/unidade
    await page.waitForURL('**/selectRole**', { timeout: 30_000 })
    
    // Espera o select estar anexado (Chosen plugin o oculta na tela, então 'visible' causaria timeout)
    await page.locator('select').nth(1).waitFor({ state: 'attached', timeout: 15_000 })

    // Lê todas as opções do segundo select (dropdown de unidade)
    const unidades = await page.evaluate(() => {
      const selects = document.querySelectorAll('select')
      if (selects.length < 2) return [] as Array<{ id: string; nome: string }>
      const unitSelect = selects[1] as HTMLSelectElement
      return Array.from(unitSelect.options)
        .filter((o) => o.value && o.value !== '' && o.value !== '0')
        .map((o) => ({ id: o.value, nome: (o.textContent ?? '').trim() }))
    })

    if (unidades.length === 0) {
      throw new Error('Nenhuma unidade encontrada — estrutura da página pode ter mudado')
    }

    // Persiste no cache em memória
    globalThis.__sipeUnidadesCache = { data: unidades, fetchedAt: Date.now() }

    // Salva no banco de dados para resiliência entre restarts
    await prisma.systemConfig.upsert({
      where: { key: 'sipe_unidades' },
      create: {
        key: 'sipe_unidades',
        value: unidades,
        description: 'Cache persistente das unidades prisionais do SIPE',
      },
      update: {
        value: unidades,
      },
    }).catch(() => {})

    return NextResponse.json({ unidades, fromSipe: true, fromCache: false })
  } catch {
    // Falhou no scrape (ex: SIPE fora do ar) → tenta carregar do cache do banco, senão fallback estático
    const dbUnits = await getCachedUnitsFromDb()
    if (dbUnits && dbUnits.length > 0) {
      return NextResponse.json({ unidades: dbUnits, fromSipe: true, fromCache: true })
    }
    return NextResponse.json({ unidades: UNIDADES_FALLBACK, fromSipe: false, fromCache: false })
  } finally {
    if (browser) await browser.close().catch(() => {})
  }
}
