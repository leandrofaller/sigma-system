import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { chromium } from 'playwright'

// ── Cache (globalThis sobrevive ao isolamento de módulos do Next.js) ──────────
declare global {
  // eslint-disable-next-line no-var
  var __sipeUnidadesCache: { data: Array<{ id: string; nome: string }>; fetchedAt: number } | null
}
globalThis.__sipeUnidadesCache = globalThis.__sipeUnidadesCache ?? null

const CACHE_TTL_MS = 24 * 60 * 60 * 1000 // 24 horas
const SIPE_URL = 'https://sipe.sejus.ro.gov.br'

// Lista estática de fallback — usada quando o SIPE está inacessível
const UNIDADES_FALLBACK: Array<{ id: string; nome: string }> = [
  { id: '3',  nome: 'CENTRO DE DETENÇÃO PROVISÓRIO DE PORTO VELHO - CDPPVH' },
  { id: '1',  nome: 'PENITENCIÁRIA ESTADUAL EDVAN MARIANO ROSENDO - PANDA' },
  { id: '5',  nome: 'PENITENCIÁRIA ESTADUAL SUELY MARIA MENDONÇA' },
  { id: '6',  nome: 'UNIDADE PROVISÓRIA DE SEGURANÇA ESPECIAL - UPES' },
  { id: '9',  nome: 'COLÔNIA AGRÍCOLA PENAL ÊNIO PINHEIRO DOS SANTOS' },
  { id: '16', nome: 'PENITENCIÁRIA ESTADUAL ARUANA - PEA' },
  { id: '17', nome: 'PENITENCIÁRIA ESTADUAL MILTON SOARES DE CARVALHO' },
  { id: '91', nome: 'PENITENCIÁRIA ESTADUAL JORGE THIAGO AGUIAR AFONSO' },
  { id: '12', nome: 'CENTRO DE RESSOCIALIZAÇÃO VALE DO GUAPORÉ - CRVG' },
  { id: '25', nome: 'CENTRO DE RESSOCIALIZAÇÃO JONAS FERRETI' },
]

export async function GET(_req: NextRequest) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  // Serve do cache se ainda válido
  const cache = globalThis.__sipeUnidadesCache
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    return NextResponse.json({ unidades: cache.data, fromSipe: true, fromCache: true })
  }

  const cpf = process.env.SIPE_CPF ?? ''
  const senha = process.env.SIPE_SENHA ?? ''

  // Sem credenciais configuradas → retorna fallback imediatamente (sem tentar abrir browser)
  if (!cpf || !senha) {
    return NextResponse.json({ unidades: UNIDADES_FALLBACK, fromSipe: false, fromCache: false })
  }

  let browser = null
  try {
    // Browser temporário e independente — não interfere no singleton de sync
    browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-extensions',
      ],
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
    // Usa nth(1) em vez de :last-of-type — os dois <select> ficam em <div>
    // diferentes, então cada um é "last-of-type" dentro do seu pai e o seletor
    // CSS resolvia para 2 elementos. nth(1) é explícito e não ambíguo.
    await page.locator('select').nth(1).waitFor({ state: 'visible', timeout: 10_000 })

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

    // Persiste no cache
    globalThis.__sipeUnidadesCache = { data: unidades, fetchedAt: Date.now() }

    return NextResponse.json({ unidades, fromSipe: true, fromCache: false })
  } catch {
    // SIPE inacessível ou falha no scrape → retorna fallback sem expor erro ao cliente
    return NextResponse.json({ unidades: UNIDADES_FALLBACK, fromSipe: false, fromCache: false })
  } finally {
    if (browser) await browser.close().catch(() => {})
  }
}
