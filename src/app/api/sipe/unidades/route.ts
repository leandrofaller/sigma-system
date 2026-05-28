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

export async function GET(_req: NextRequest) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  // Serve do cache se ainda válido
  const cache = globalThis.__sipeUnidadesCache
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    return NextResponse.json({ unidades: cache.data, fromCache: true })
  }

  const cpf = process.env.SIPE_CPF ?? ''
  const senha = process.env.SIPE_SENHA ?? ''

  if (!cpf || !senha) {
    return NextResponse.json(
      { error: 'Credenciais SIPE não configuradas (SIPE_CPF / SIPE_SENHA)' },
      { status: 503 }
    )
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
    await page.waitForSelector('select:last-of-type', { timeout: 10_000 })

    // Lê todas as opções do dropdown de unidade (segundo select)
    const unidades = await page.$$eval(
      'select:last-of-type option',
      (opts: Element[]) =>
        (opts as HTMLOptionElement[])
          .filter((o) => o.value && o.value !== '' && o.value !== '0')
          .map((o) => ({ id: o.value, nome: o.textContent?.trim() ?? '' }))
    )

    if (unidades.length === 0) {
      throw new Error('Nenhuma unidade encontrada no dropdown — estrutura da página pode ter mudado')
    }

    // Persiste no cache
    globalThis.__sipeUnidadesCache = { data: unidades, fetchedAt: Date.now() }

    return NextResponse.json({ unidades, fromCache: false })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro desconhecido'
    return NextResponse.json(
      { error: `Falha ao buscar unidades do SIPE: ${message}` },
      { status: 503 }
    )
  } finally {
    if (browser) await browser.close().catch(() => {})
  }
}
