/**
 * SIPE Scraper — Playwright-based crawler for sipe.sejus.ro.gov.br
 *
 * LAST UPDATED: 2026-05-28 22:46 - Fixed: Timeout 8000ms + múltiplos seletores
 *
 * Design (mirrors ArcFace indexing-job pattern):
 * - globalThis singleton state (survives Next.js module isolation across routes)
 * - DB-persisted checkpoint (survives VPS restarts / process crashes)
 * - Cursor-based resume: stores collected IDs + last processed SIPE ID
 * - Crash detection: jobs RUNNING with no `ultimaAtividade` update in 10 min
 *   are auto-transitioned to INTERRUPTED and can be resumed
 *
 * ⚠️  Why globalThis?
 *   Next.js App Router bundles each route file separately, so module-level
 *   `let` variables in sipe-scraper.ts produce DIFFERENT instances when
 *   imported by sync/route.ts, sync/stream/route.ts, and sync/stop/route.ts.
 *   globalThis is the single shared namespace for the whole Node.js process,
 *   guaranteeing that getSipeState() and stopSipeJob() see the same object
 *   as startSipeSync() regardless of which route called them.
 */

import { chromium, Browser, BrowserContext, Page } from 'playwright'
import { existsSync } from 'fs'
import { prisma } from './db'
import sharp from 'sharp'
import * as cheerio from 'cheerio'
import { join } from 'path'
import { getApenadosDir } from './storage'
import { createHash } from 'crypto'
import { capsolverService } from './capsolver-service'

// ── Config ────────────────────────────────────────────────────
const SIPE_URL = 'https://sipe.sejus.ro.gov.br'
// env vars set in .env; fallback to empty so TS is happy
const SIPE_CPF = process.env.SIPE_CPF ?? ''
const SIPE_SENHA = process.env.SIPE_SENHA ?? ''
const SIPE_PERFIL = process.env.SIPE_PERFIL ?? '2'   // Master
const SIPE_UNIDADE = process.env.SIPE_UNIDADE ?? '3'  // CDPPVH

const SIPE_PYTHON_API_URL = process.env.SIPE_PYTHON_API_URL ?? 'http://localhost:8000'
export type SipeEngine = 'playwright' | 'firecrawl' | 'python-sdk'
const DEFAULT_SIPE_ENGINE: SipeEngine = (process.env.SIPE_SCRAPER_ENGINE as SipeEngine) ?? 'python-sdk'

type SipeProxyResponse = {
  content_type?: string
  is_binary: boolean
  html?: string
  text?: string
  data?: string
  json?: any
}

export function normalizeOAB(oab: string | null | undefined): string | null {
  if (!oab) return null
  let cleaned = oab.trim().toUpperCase()
  cleaned = cleaned.replace(/\./g, '')
  cleaned = cleaned.replace(/[-\s]/g, '/')
  cleaned = cleaned.replace(/\/+/g, '/')
  const match = cleaned.match(/^(\d+[A-Z]?)\/?([A-Z]{2})$/)
  if (match) {
    return `${match[1]}/${match[2]}`
  }
  return cleaned
}

export function normalizeCPF(cpf: string | null | undefined): string | null {
  if (!cpf) return null
  const cleaned = cpf.replace(/\D/g, '')
  return cleaned.length === 11 ? cleaned : null
}

/**
 * Tenta obter o HTML ou Imagem do SIPE através do Proxy Python FastAPI (curl_cffi).
 * Caso a chamada falhe ou o motor de scraping não seja "python-sdk", retorna null (para ativar o fallback).
 */
async function requestSipeViaProxy(options: {
  path: string
  method?: 'GET' | 'POST'
  params?: Record<string, string>
  form?: Record<string, any>
  headers?: Record<string, string>
  timeoutMs?: number
}): Promise<SipeProxyResponse | null> {
  if (globalThis.__sipeCurrentEngine !== 'python-sdk') {
    return null
  }

  try {
    const cleanPath = options.path.startsWith('/') ? options.path : `/${options.path}`
    const method = options.method ?? 'GET'
    const timeoutMs = options.timeoutMs ?? 15000
    const url = method === 'GET'
      ? `${SIPE_PYTHON_API_URL}/sipe/proxy?path=${encodeURIComponent(cleanPath)}`
      : `${SIPE_PYTHON_API_URL}/sipe/proxy`

    const res = await fetch(url, {
      method,
      headers: {
        'Accept': 'application/json',
        'X-Sipe-Unidade': globalThis.__sipeFallbackUnidade || SIPE_UNIDADE,
        ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {}),
      },
      body: method === 'POST'
        ? JSON.stringify({
            path: cleanPath,
            method,
            params: options.params,
            form: options.form,
            headers: options.headers,
          })
        : undefined,
      signal: AbortSignal.timeout(timeoutMs),
    })

    if (!res.ok) {
      console.warn(`[PYTHON PROXY] ⚠️ Chamada ${method} falhou com status ${res.status} para o path: ${cleanPath}. Ativando fallback para Playwright.`)
      return null
    }

    const data = await res.json()
    console.log(`[PYTHON PROXY] ✅ Sucesso via SDK Python para: ${cleanPath} (binary: ${data?.is_binary ?? false})`)
    return data
  } catch (err: any) {
    console.warn(`[PYTHON PROXY] ⚠️ Erro de rede na API Python para o path ${options.path}: ${err.message || err}. Ativando fallback para Playwright.`)
    return null
  }
}

async function fetchSipeViaProxy(path: string): Promise<SipeProxyResponse | null> {
  return requestSipeViaProxy({ path, method: 'GET' })
}


/** ms without a heartbeat before a job is considered crashed */
const CRASH_TIMEOUT_MS = 10 * 60 * 1000 // 10 min

// ── Shared singleton via globalThis (survives module isolation) ──────────

export interface SipeSyncProgress {
  jobId: string
  status: 'RUNNING' | 'COMPLETED' | 'FAILED' | 'INTERRUPTED'
  fase: string
  total: number
  processado: number
  erros: number
  ultimoLog: string
  startTime: number
  /** Percentage 0-100 */
  pct: number
  tipo?: string
}

declare global {
  // eslint-disable-next-line no-var
  var __sipeState: SipeSyncProgress | null
  // eslint-disable-next-line no-var
  var __sipeStopFlag: boolean
  // eslint-disable-next-line no-var
  var __sipeCurrentEngine: SipeEngine
  // eslint-disable-next-line no-var
  var __sipeFallbackUnidade: string | null
}

// Initialize once per process; no-op on hot-reloads
if (globalThis.__sipeState === undefined) globalThis.__sipeState = null
if (globalThis.__sipeStopFlag === undefined) globalThis.__sipeStopFlag = false
if (globalThis.__sipeCurrentEngine === undefined) globalThis.__sipeCurrentEngine = DEFAULT_SIPE_ENGINE
if (globalThis.__sipeFallbackUnidade === undefined) globalThis.__sipeFallbackUnidade = SIPE_UNIDADE

function setCurrentSipeEngine(engine: SipeEngine, fallbackUnidade?: string | null): void {
  globalThis.__sipeCurrentEngine = engine
  if (fallbackUnidade) {
    globalThis.__sipeFallbackUnidade = fallbackUnidade
  }
}

function isPythonSdkEngine(): boolean {
  return globalThis.__sipeCurrentEngine === 'python-sdk'
}

export function getSipeState(): SipeSyncProgress | null {
  return globalThis.__sipeState
}

export function stopSipeJob(): void {
  globalThis.__sipeStopFlag = true
  if (globalThis.__sipeState) {
    globalThis.__sipeState.status = 'INTERRUPTED'
    globalThis.__sipeState.ultimoLog = 'Interrompido pelo usuário'
    globalThis.__sipeState = null
  }
}

// ── Crash detection helper ────────────────────────────────────

/**
 * Call this on module init or before starting a new job.
 * Jobs stuck in RUNNING with no heartbeat are moved to INTERRUPTED.
 */
export async function detectAndMarkCrashedJobs(): Promise<void> {
  const cutoff = new Date(Date.now() - CRASH_TIMEOUT_MS)
  // Jobs PENDING há mais de 2 minutos nunca chegaram a iniciar
  const pendingCutoff = new Date(Date.now() - 2 * 60 * 1000)

  // Consultar se há algum job travado antes de atualizar
  const crashedJobs = await prisma.sipeSyncJob.findMany({
    where: {
      OR: [
        // RUNNING sem heartbeat recente
        {
          status: 'RUNNING',
          OR: [
            { ultimaAtividade: { lt: cutoff } },
            { ultimaAtividade: null, iniciadoEm: { lt: cutoff } },
          ],
        },
        // PENDING travado (nunca chegou a iniciar)
        {
          status: 'PENDING',
          createdAt: { lt: pendingCutoff },
        },
      ],
    },
    select: { id: true }
  })

  if (crashedJobs.length > 0) {
    await prisma.sipeSyncJob.updateMany({
      where: { id: { in: crashedJobs.map(j => j.id) } },
      data: { status: 'INTERRUPTED' },
    })

    // Limpa a memória global se o job ativo for detectado como crashed
    if (globalThis.__sipeState && crashedJobs.some(j => j.id === globalThis.__sipeState?.jobId)) {
      globalThis.__sipeState = null
    }
  }
}

// ── Browser pool ──────────────────────────────────────────────

let browserInstance: Browser | null = null

/**
 * Tenta localizar um executável Chromium instalado no sistema operacional.
 * Usado como fallback quando o binário empacotado pelo Playwright não está disponível
 * (comum em VPS Linux onde `playwright install` foi executado por usuário diferente).
 */
function findSystemChromium(): string | undefined {
  // Variável de ambiente tem prioridade (ex: PLAYWRIGHT_EXECUTABLE_PATH=/usr/bin/chromium)
  if (process.env.PLAYWRIGHT_EXECUTABLE_PATH) return process.env.PLAYWRIGHT_EXECUTABLE_PATH

  const candidates = [
    '/usr/bin/chromium-browser',   // Ubuntu/Debian padrão
    '/usr/bin/chromium',           // Debian / Arch
    '/usr/bin/google-chrome-stable',
    '/usr/bin/google-chrome',
    '/snap/bin/chromium',          // Snap
    '/usr/local/bin/chromium',
  ]
  return candidates.find(existsSync)
}

async function getBrowser(): Promise<Browser> {
  if (!browserInstance || !browserInstance.isConnected()) {
    const executablePath = findSystemChromium()
    browserInstance = await chromium.launch({
      headless: true,
      ignoreDefaultArgs: ['--enable-automation'],
      // Flags obrigatórias para Docker (sem seccomp/AppArmor por padrão)
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--disable-dev-shm-usage',   // evita crash por /dev/shm lotado em container
        '--disable-gpu',
        '--disable-extensions',
        '--disable-background-networking',
      ],
      // Se encontrou Chromium do sistema, usa ele; caso contrário, usa o binário do Playwright
      ...(executablePath ? { executablePath } : {}),
    })
  }
  return browserInstance
}

async function createSession(): Promise<BrowserContext> {
  const browser = await getBrowser()
  return browser.newContext({
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
      'Chrome/120.0.0.0 Safari/537.36',
  })
}

// ── SIPE authentication ───────────────────────────────────────

async function login(page: Page, unidadeId: string): Promise<boolean> {
  // Timeout maior para servidores governamentais lentos
  await page.goto(`${SIPE_URL}/`, { waitUntil: 'domcontentloaded', timeout: 60_000 })

  // Aguarda o formulário aparecer (até 30s)
  await page.waitForSelector('input[type="password"]', { timeout: 30_000 })

  // Preenche CPF — tenta placeholder*="CPF" e fallback para primeiro input de texto
  const cpfInput =
    (await page.$('input[placeholder*="CPF"]')) ??
    (await page.$('input[name*="cpf"], input[name*="login"], input[type="text"]'))
  if (!cpfInput) {
    throw new Error(
      `Campo CPF não encontrado na página de login. URL atual: ${page.url()}`
    )
  }

  await cpfInput.fill(SIPE_CPF)
  await page.fill('input[type="password"]', SIPE_SENHA)

  // Clica no submit — tenta button[type="submit"] e fallback para qualquer botão
  const submitBtn =
    (await page.$('button[type="submit"]')) ??
    (await page.$('input[type="submit"]')) ??
    (await page.$('button'))
  if (!submitBtn) throw new Error('Botão de submit não encontrado na página de login')
  await submitBtn.click()

  // Aguarda redirecionamento para selectRole (servidor pode ser lento — 30s)
  try {
    await page.waitForURL('**/selectRole**', { timeout: 30_000 })
  } catch {
    // Captura estado real da página para diagnóstico
    const url = page.url()
    const bodyText = await page.innerText('body').catch(() => '')
    const errorMsg = bodyText.slice(0, 300).replace(/\s+/g, ' ').trim()
    throw new Error(
      `Login não redirecionou para /selectRole. URL atual: ${url}` +
      (errorMsg ? ` | Página: ${errorMsg}` : '')
    )
  }

  // Wait for selects to be attached in the DOM
  await page.locator('select').nth(0).waitFor({ state: 'attached', timeout: 10_000 })
  await page.locator('select').nth(1).waitFor({ state: 'attached', timeout: 10_000 })

  // Select profile via page.evaluate to bypass Chosen hiding the select element
  await page.evaluate((perfil) => {
    const selects = document.querySelectorAll('select')
    const selectPerfil = selects[0] as HTMLSelectElement
    if (selectPerfil) {
      selectPerfil.value = perfil
      selectPerfil.dispatchEvent(new Event('change', { bubbles: true }))
      const w = window as any
      if (w.$) {
        try {
          w.$(selectPerfil).trigger('chosen:updated')
          w.$(selectPerfil).trigger('change')
        } catch {}
      }
    }
  }, SIPE_PERFIL)

  // Aguarda dinamicamente até que a unidade desejada esteja disponível nas options do segundo select
  try {
    await page.waitForFunction((unidade) => {
      const selects = document.querySelectorAll('select')
      const selectUnidade = selects[1] as HTMLSelectElement
      if (!selectUnidade) return false
      const options = Array.from(selectUnidade.options)
      return options.some(opt => opt.value === unidade)
    }, unidadeId, { timeout: 15_000 })
  } catch (err) {
    // Se estourar o timeout, ainda tenta prosseguir (fallback)
  }

  // Select unit via page.evaluate
  await page.evaluate((unidade) => {
    const selects = document.querySelectorAll('select')
    const selectUnidade = selects[1] as HTMLSelectElement
    if (selectUnidade) {
      selectUnidade.value = unidade
      selectUnidade.dispatchEvent(new Event('change', { bubbles: true }))
      const w = window as any
      if (w.$) {
        try {
          w.$(selectUnidade).trigger('chosen:updated')
          w.$(selectUnidade).trigger('change')
        } catch {}
      }
    }
  }, unidadeId)

  // Pequeno delay para garantir estabilização da reatividade jQuery/Chosen
  await page.waitForTimeout(500)

  const submitBtn2 =
    (await page.$('button[type="submit"]')) ??
    (await page.$('input[type="submit"]')) ??
    (await page.$('button'))
  if (!submitBtn2) throw new Error('Botão de submit não encontrado na página selectRole')
  await submitBtn2.click()

  // Aguarda /home (30s)
  try {
    if (!page.url().includes('/home')) {
      await page.waitForURL('**/home**', { timeout: 30_000 })
    }
  } catch {
    const url = page.url()
    if (!url.includes('/home')) {
      throw new Error(`Seleção de perfil não redirecionou para /home. URL atual: ${url}`)
    }
  }

  return true
}

async function ensureFallbackLogin(page: Page): Promise<void> {
  if ((page as any).__sipeAuthenticated === true) {
    return
  }

  const fallbackUnidade = globalThis.__sipeFallbackUnidade || SIPE_UNIDADE
  const ok = await login(page, fallbackUnidade)
  if (!ok) {
    throw new Error(`Falha no login do SIPE para fallback Playwright (unidade ${fallbackUnidade})`)
  }
  ;(page as any).__sipeAuthenticated = true
}

function markFallbackSessionDirty(page: Page): void {
  ;(page as any).__sipeAuthenticated = false
}

async function gotoSipeWithFallback(
  page: Page,
  path: string,
  options: Parameters<Page['goto']>[1] = { waitUntil: 'domcontentloaded' }
) {
  await ensureFallbackLogin(page)
  const cleanPath = path.startsWith('/') ? path : `/${path}`
  let res = await page.goto(`${SIPE_URL}${cleanPath}`, options)
  
  // Verifica se foi redirecionado para a tela de login
  const currentUrl = page.url()
  if (
    currentUrl.includes('/login') ||
    currentUrl.replace(/\/$/, '') === SIPE_URL.replace(/\/$/, '')
  ) {
    console.log(`[PLAYWRIGHT FALLBACK] ⚠️ Sessão expirada detectada ao navegar para ${cleanPath}. Re-autenticando no SIPE...`)
    markFallbackSessionDirty(page)
    await ensureFallbackLogin(page)
    res = await page.goto(`${SIPE_URL}${cleanPath}`, options)
  }
  return res
}

function extractIdsFromHtml(html: string, entity: 'apenados' | 'advogados'): number[] {
  const regex = entity === 'apenados'
    ? /\/apenados\/(\d+)\/(?:selecionarOpcao|editar)/g
    : /\/advogados\/(\d+)(?:\/|["'?])/g

  const ids = new Set<number>()
  let match: RegExpExecArray | null

  while ((match = regex.exec(html)) !== null) {
    const parsed = parseInt(match[1], 10)
    if (!isNaN(parsed) && parsed > 0) {
      ids.add(parsed)
    }
  }

  return [...ids].sort((a, b) => a - b)
}

function extractAjaxPathFromHtml(html: string): string | null {
  const patterns = [
    /ajax\s*:\s*\{\s*url\s*:\s*['"]([^'"]+)['"]/i,
    /ajax\s*:\s*['"]([^'"]+)['"]/i,
    /sAjaxSource\s*[:=]\s*['"]([^'"]+)['"]/i,
  ]

  for (const pattern of patterns) {
    const match = html.match(pattern)
    if (match?.[1]) {
      return match[1].replace(/\\\//g, '/')
    }
  }

  return null
}

async function fetchPaginatedIdsViaProxy(
  ajaxPath: string,
  entity: 'apenados' | 'advogados'
): Promise<number[]> {
  const normalizedPath = ajaxPath.startsWith('http')
    ? ajaxPath.replace(SIPE_URL, '')
    : ajaxPath

  const ids = new Set<number>()
  const testMode = (globalThis as any).SCRAPING_TESTE_MODE === true
  const maxIds = testMode ? 150 : Number.POSITIVE_INFINITY

  let start = 0
  const length = 500
  let draw = 1

  while (ids.size < maxIds) {
    const proxyData = await requestSipeViaProxy({
      path: normalizedPath,
      method: 'POST',
      form: {
        draw: String(draw++),
        start: String(start),
        length: String(length),
        'columns[0][data]': '0',
        'order[0][column]': '0',
        'order[0][dir]': 'asc',
      },
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      timeoutMs: 20000,
    })

    const rows: any[] = proxyData?.json?.data ?? proxyData?.json?.aaData ?? []
    if (rows.length === 0) {
      break
    }

    const chunk = extractIdsFromHtml(JSON.stringify(rows), entity)
    for (const id of chunk) {
      ids.add(id)
      if (ids.size >= maxIds) break
    }

    start += length
    const totalRecords = proxyData?.json?.recordsFiltered ?? proxyData?.json?.recordsTotal ?? rows.length
    if (rows.length < length || start >= totalRecords) {
      break
    }
  }

  return [...ids]
}

// ── DB progress helpers ───────────────────────────────────────

async function dbProgress(
  jobId: string,
  patch: {
    status?: string
    fase?: string
    processado?: number
    erros?: number
    total?: number
    log?: string
    idsColetados?: string
    ultimoIdProcessado?: number
    iniciadoEm?: Date
    finalizadoEm?: Date
  }
) {
  const current = await prisma.sipeSyncJob.findUnique({ where: { id: jobId } })
  if (!current) return

  await prisma.sipeSyncJob.update({
    where: { id: jobId },
    data: {
      ...patch,
      ultimaAtividade: new Date(),
      log: patch.log
        ? current.log
          ? current.log + '\n' + patch.log
          : patch.log
        : undefined,
    },
  })
}

/** Sync DB → in-memory state */
function refreshMemory(_jobId: string, patch: Partial<SipeSyncProgress>) {
  if (!globalThis.__sipeState) return
  Object.assign(globalThis.__sipeState, patch)
  if (globalThis.__sipeState.total > 0) {
    globalThis.__sipeState.pct = Math.round(
      (globalThis.__sipeState.processado / globalThis.__sipeState.total) * 100
    )
  }
}

// ── Main entry points ─────────────────────────────────────────

/**
 * Start a new sync job or resume an interrupted one.
 * Runs entirely in background — returns immediately.
 */
export function startSipeSync(jobId: string, unidadeId: string, engine: SipeEngine = 'playwright'): void {
  if (globalThis.__sipeState?.status === 'RUNNING') return

  setCurrentSipeEngine(engine, unidadeId)
  globalThis.__sipeStopFlag = false
  globalThis.__sipeState = {
    jobId,
    status: 'RUNNING',
    fase: 'Iniciando...',
    total: 0,
    processado: 0,
    erros: 0,
    ultimoLog: '',
    startTime: Date.now(),
    pct: 0,
  }

  const runPromise = async () => {
    const job = await prisma.sipeSyncJob.findUnique({ where: { id: jobId } })
    if (!job) throw new Error('Job não encontrado')

    if (globalThis.__sipeState) {
      globalThis.__sipeState.tipo = job.tipo
    }

    if (job.tipo === 'UNIDADES') {
      await runScrapeTodasUnidades(jobId, false)
    } else if (job.tipo === 'UNIDADES_FAST') {
      await runScrapeTodasUnidades(jobId, true)
    } else {
      await runScrape(jobId, unidadeId)
    }
  }

  runPromise().catch(async (err) => {
    const msg = err?.message ?? String(err)
    globalThis.__sipeState = { ...globalThis.__sipeState!, status: 'FAILED', ultimoLog: msg }
    await dbProgress(jobId, {
      status: 'FAILED',
      finalizadoEm: new Date(),
      log: `Erro fatal: ${msg}`,
    })
  })
}

/** Resume an INTERRUPTED job without re-collecting IDs */
export function resumeSipeSync(jobId: string, unidadeId: string, engine: SipeEngine = 'playwright'): void {
  startSipeSync(jobId, unidadeId, engine) // startSipeSync detects existing IDs in DB
}

/**
 * Inicia a sincronização CNA de todos os advogados em background com acompanhamento de job.
 */
export function startCnaAllSync(jobId: string): void {
  if (globalThis.__sipeState?.status === 'RUNNING') return

  globalThis.__sipeStopFlag = false
  globalThis.__sipeState = {
    jobId,
    status: 'RUNNING',
    fase: 'Iniciando...',
    total: 0,
    processado: 0,
    erros: 0,
    ultimoLog: '',
    startTime: Date.now(),
    pct: 0,
  }

  const runPromise = async () => {
    const job = await prisma.sipeSyncJob.findUnique({ where: { id: jobId } })
    if (!job) throw new Error('Job não encontrado')

    await dbProgress(jobId, {
      log: 'Carregando lista de advogados do banco...',
      fase: 'Iniciando',
    })
    refreshMemory(jobId, { fase: 'Iniciando', ultimoLog: 'Carregando lista de advogados do banco...' })

    const advogados = await prisma.sipeAdvogado.findMany({
      where: { oab: { not: null } },
      select: { id: true, oab: true, nome: true },
    })

    if (advogados.length === 0) {
      const msg = 'Nenhum advogado com OAB cadastrada no sistema.'
      await dbProgress(jobId, {
        status: 'COMPLETED',
        finalizadoEm: new Date(),
        log: msg,
        fase: 'Concluído',
      })
      refreshMemory(jobId, { status: 'COMPLETED', fase: 'Concluído', ultimoLog: msg })
      return
    }

    refreshMemory(jobId, { total: advogados.length, fase: 'Preparando browser...' })
    await dbProgress(jobId, {
      total: advogados.length,
      log: `Encontrados ${advogados.length} advogados com OAB para sincronizar. Preparando sessão...`,
    })

    const browser = await getBrowser()
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    })
    const page = await context.newPage()

    try {
      for (let i = 0; i < advogados.length; i++) {
        if (globalThis.__sipeStopFlag) {
          await dbProgress(jobId, {
            status: 'INTERRUPTED',
            finalizadoEm: new Date(),
            log: 'Sincronização CNA interrompida pelo usuário',
          })
          refreshMemory(jobId, { status: 'INTERRUPTED' })
          return
        }

        const adv = advogados[i]
        const progressMsg = `Sincronizando advogado [${i + 1}/${advogados.length}]: ${adv.nome} (${adv.oab})`
        console.log(`[CNA API OAB] ${progressMsg}`)
        
        refreshMemory(jobId, {
          fase: `Processando ${i + 1}/${advogados.length}`,
          ultimoLog: progressMsg,
        })
        await dbProgress(jobId, {
          log: progressMsg,
          fase: `Processando ${i + 1}/${advogados.length}`,
        })

        if (adv.oab) {
          try {
            await scrapeCnaOabDetails(page, adv.id, adv.oab, jobId)

            globalThis.__sipeState!.processado++
            globalThis.__sipeState!.pct = Math.round(
              (globalThis.__sipeState!.processado / advogados.length) * 100
            )

            await dbProgress(jobId, {
              processado: globalThis.__sipeState!.processado,
            })

            // Delay natural entre consultas (evita disparo de CAPTCHA)
            const delayBetweenRequests = 4000 + Math.random() * 3000 // 4-7 segundos
            await page.waitForTimeout(delayBetweenRequests)
          } catch (err: any) {
            if (globalThis.__sipeState) {
              globalThis.__sipeState.erros++
            }
            const errMsg = `Erro ao sincronizar ${adv.nome} (${adv.oab}): ${err?.message || err}`
            console.error(`[CNA API OAB] ${errMsg}`)
            
            refreshMemory(jobId, { ultimoLog: errMsg })
            await dbProgress(jobId, {
              erros: globalThis.__sipeState?.erros ?? 0,
              log: errMsg,
            })
          }
        }
      }

      const summary = `Concluído: Sincronização CNA finalizada. ${globalThis.__sipeState!.processado} processados, ${globalThis.__sipeState!.erros} erros.`
      globalThis.__sipeState = {
        ...globalThis.__sipeState!,
        status: 'COMPLETED',
        fase: 'Concluído',
        ultimoLog: summary,
      }
      await dbProgress(jobId, {
        status: 'COMPLETED',
        finalizadoEm: new Date(),
        log: summary,
        fase: 'Concluído',
      })

    } finally {
      await context.close().catch(() => {})
    }
  }

  runPromise().catch(async (err) => {
    const msg = err?.message ?? String(err)
    globalThis.__sipeState = { ...globalThis.__sipeState!, status: 'FAILED', ultimoLog: msg }
    await dbProgress(jobId, {
      status: 'FAILED',
      finalizadoEm: new Date(),
      log: `Erro fatal: ${msg}`,
    })
  })
}

// ── Core scrape loop ──────────────────────────────────────────

async function runScrape(jobId: string, unidadeId: string): Promise<void> {
  const job = await prisma.sipeSyncJob.findUnique({ where: { id: jobId } })
  if (!job) throw new Error('Job não encontrado')

  // Job is already RUNNING in DB (set at creation time in the route).
  // Just persist the first log entry and update fase.
  await dbProgress(jobId, {
    log: 'Iniciando sessão no SIPE...',
    fase: 'Login',
  })
  refreshMemory(jobId, { fase: 'Login', ultimoLog: 'Iniciando sessão no SIPE...' })

  const context = await createSession()
  const page = await context.newPage()
  markFallbackSessionDirty(page)

  // Tipos sem unidade específica usam a unidade padrão '3' apenas para fazer login
  const loginUnidade = (unidadeId === 'EXTRAMUROS' || unidadeId === 'GLOBAL') ? '3' : unidadeId
  setCurrentSipeEngine(globalThis.__sipeCurrentEngine, loginUnidade)

  try {
    if (isPythonSdkEngine()) {
      log(jobId, 'SDK Python ativado como caminho principal. Playwright ficará em modo rollback.')
    } else {
      const ok = await login(page, loginUnidade)
      if (!ok) throw new Error('Falha no login do SIPE')
      ;(page as any).__sipeAuthenticated = true
      log(jobId, 'Login realizado com sucesso')
    }

    // ── Phase 1: collect IDs (or load from checkpoint) ────────
    let ids: number[] = []

    if (job.idsColetados) {
      // Resume (or IDS_MANUAIS with pre-populated IDs): reuse previously collected list
      ids = JSON.parse(job.idsColetados) as number[]
      const allIds = ids
      // Determine which IDs remain (after cursor)
      const cursor = job.ultimoIdProcessado ?? null
      if (cursor !== null) {
        const cursorIndex = ids.indexOf(cursor)
        ids = cursorIndex >= 0 ? ids.slice(cursorIndex + 1) : ids
      }
      const alreadyDone = (job.processado ?? 0)
      const isManual = job.tipo === 'IDS_MANUAIS'
      const faseMsg = isManual
        ? `Scraping de ${ids.length} ID(s) manuais`
        : job.tipo === 'ADVOGADOS' ? 'Retomando scraping de advogados...'
        : job.tipo === 'EXTRAMUROS' ? 'Retomando scraping extramuros...'
        : job.tipo === 'GLOBAL' ? 'Retomando scraping global...'
        : 'Retomando scraping de apenados...'
      const logMsg = isManual
        ? `${ids.length} ID(s) para scraping: ${ids.slice(0, 5).join(', ')}${ids.length > 5 ? '...' : ''}`
        : `Retomando do ID #${cursor ?? 'início'} — ${ids.length} restantes`
      refreshMemory(jobId, {
        fase: faseMsg,
        total: allIds.length,
        processado: alreadyDone,
        ultimoLog: logMsg,
      })
      await dbProgress(jobId, {
        log: logMsg,
        fase: isManual ? 'Scraping por IDs manuais' : 'Retomando',
      })
    } else {
      // Fresh start: collect all IDs
      if (job.tipo === 'ADVOGADOS') {
        refreshMemory(jobId, { fase: 'Coletando lista de advogados...' })
        await dbProgress(jobId, { fase: 'Coletando IDs', log: 'Coletando lista de advogados...' })

        ids = await coletarIdsAdvogados(page, jobId)

        // Persist checkpoint
        await dbProgress(jobId, {
          idsColetados: JSON.stringify(ids),
          total: ids.length,
          log: `${ids.length} advogados encontrados — iniciando scraping`,
          fase: 'Scraping advogados',
        })
        refreshMemory(jobId, {
          total: ids.length,
          fase: 'Scraping advogados',
          ultimoLog: `${ids.length} advogados encontrados`,
        })
      } else if (job.tipo === 'EXTRAMUROS') {
        refreshMemory(jobId, { fase: 'Consultando banco por apenados extramuros...' })

        ids = await coletarIdsExtramuros(jobId)

        // Persist checkpoint
        await dbProgress(jobId, {
          idsColetados: JSON.stringify(ids),
          total: ids.length,
          log: `${ids.length} apenados extramuros encontrados — iniciando scraping`,
          fase: 'Scraping extramuros',
        })
        refreshMemory(jobId, {
          total: ids.length,
          fase: 'Scraping extramuros',
          ultimoLog: `${ids.length} apenados extramuros encontrados`,
        })
      } else if (job.tipo === 'GLOBAL') {
        refreshMemory(jobId, { fase: 'Coletando lista global de apenados...' })
        await dbProgress(jobId, { fase: 'Coletando IDs', log: 'Iniciando coleta global via /apenados/index...' })

        ids = await coletarIdsApenados(page, 'GLOBAL', jobId, null, true)

        // Persist checkpoint
        await dbProgress(jobId, {
          idsColetados: JSON.stringify(ids),
          total: ids.length,
          log: `${ids.length} apenados encontrados globalmente — iniciando scraping`,
          fase: 'Scraping global',
        })
        refreshMemory(jobId, {
          total: ids.length,
          fase: 'Scraping global',
          ultimoLog: `${ids.length} apenados encontrados globalmente`,
        })
      } else {
        refreshMemory(jobId, { fase: 'Coletando lista de apenados...' })
        await dbProgress(jobId, { fase: 'Coletando IDs', log: 'Coletando lista de apenados...' })

        ids = await coletarIdsApenados(page, unidadeId, jobId, job.unidadeNome)

        // Persist checkpoint
        await dbProgress(jobId, {
          idsColetados: JSON.stringify(ids),
          total: ids.length,
          log: `${ids.length} apenados encontrados — iniciando scraping`,
          fase: 'Scraping apenados',
        })
        refreshMemory(jobId, {
          total: ids.length,
          fase: 'Scraping apenados',
          ultimoLog: `${ids.length} apenados encontrados`,
        })
      }
    }

    // ── Phase 2: scrape each profile ──────────────────────────
    let cleanUnidadeNome = job.unidadeNome
    if (job.tipo === 'IDS_MANUAIS' && job.unidadeNome?.includes(' — ')) {
      cleanUnidadeNome = job.unidadeNome.split(' — ')[1]
    }

    let lastProcessedId: number | undefined
    for (const sipeId of ids) {
      if (globalThis.__sipeStopFlag) {
        await dbProgress(jobId, {
          status: 'INTERRUPTED',
          finalizadoEm: new Date(),
          log: 'Sincronização interrompida pelo usuário',
        })
        refreshMemory(jobId, { status: 'INTERRUPTED' })
        return
      }

      const useSearch = job.tipo === 'IDS_MANUAIS' || job.tipo === 'EXTRAMUROS'

      try {
        await withRetry(async () => {
          try {
            if (job.tipo === 'ADVOGADOS') {
              await scrapeAdvogadoDetalhe(page, sipeId, jobId)
            } else {
              const apenadoCache = listagemInfoCache.get(sipeId)
              const apenadoUnidadeNome = apenadoCache?.unidadeNome ?? cleanUnidadeNome ?? null
              await scrapeApenadoFicha(page, sipeId, apenadoUnidadeNome, useSearch)
            }
          } catch (err: any) {
            if (err?.message === 'SESSAO_EXPIRADA') {
              log(jobId, 'Sessão expirada detectada. Re-autenticando no SIPE...')
              markFallbackSessionDirty(page)
              await login(page, loginUnidade)
              ;(page as any).__sipeAuthenticated = true

              if (job.tipo === 'ADVOGADOS') {
                await scrapeAdvogadoDetalhe(page, sipeId, jobId)
              } else {
                const apenadoCache = listagemInfoCache.get(sipeId)
                const apenadoUnidadeNome = apenadoCache?.unidadeNome ?? cleanUnidadeNome ?? null
                await scrapeApenadoFicha(page, sipeId, apenadoUnidadeNome, useSearch)
              }
            } else {
              throw err
            }
          }
        })
        lastProcessedId = sipeId
        if (globalThis.__sipeState) {
          globalThis.__sipeState.processado++
          globalThis.__sipeState.pct = globalThis.__sipeState.total
            ? Math.round(
                (globalThis.__sipeState.processado / globalThis.__sipeState.total) * 100
              )
            : 0

          // Persiste cursor a cada registro para recovery sem perda em crash/restart
          await dbProgress(jobId, {
            processado: globalThis.__sipeState.processado,
            ultimoIdProcessado: sipeId,
          })
        }
        // Polite delay (reduzido drasticamente no modo SDK para velocidade máxima)
        await page.waitForTimeout(isPythonSdkEngine() ? 50 : (300 + Math.random() * 500))
      } catch (err) {
        if (globalThis.__sipeState) {
          globalThis.__sipeState.erros++
          const msg = job.tipo === 'ADVOGADOS'
            ? `Erro advogado #${sipeId} (após 3 tentativas): ${err}`
            : `Erro apenado #${sipeId} (após 3 tentativas): ${err}`
          globalThis.__sipeState.ultimoLog = msg
          await dbProgress(jobId, { erros: globalThis.__sipeState.erros, log: msg })
        } else {
          console.error(`Erro ao sincronizar #${sipeId} (estado inativo): ${err}`)
        }
      }
    }

    // Final cursor flush — use the actual last processed ID, not ids[last]
    await dbProgress(jobId, {
      processado: globalThis.__sipeState!.processado,
      ...(lastProcessedId !== undefined ? { ultimoIdProcessado: lastProcessedId } : {}),
    })

    // ── Done ──────────────────────────────────────────────────
    const summary =
      job.tipo === 'ADVOGADOS'
        ? `Concluído: Sincronização de advogados realizada com sucesso, ${globalThis.__sipeState!.erros} erros`
        : `Concluído: ${globalThis.__sipeState!.processado} apenados processados, ${globalThis.__sipeState!.erros} erros`

    globalThis.__sipeState = {
      ...globalThis.__sipeState!,
      status: 'COMPLETED',
      fase: 'Concluído',
      ultimoLog: summary,
    }
    await dbProgress(jobId, {
      status: 'COMPLETED',
      finalizadoEm: new Date(),
      log: summary,
      fase: 'Concluído',
    })
  } finally {
    listagemInfoCache.clear()
    await context.close()
  }
}

async function setupFastPageIfNeeded(page: Page, fast: boolean): Promise<void> {
  if (!fast) return
  await page.route('**/*', (route) => {
    const url = route.request().url().toLowerCase();
    const resourceType = route.request().resourceType();
    
    // Bloquear recursos que não impedem a leitura dos textos e fotos
    if (
      resourceType === 'font' ||
      resourceType === 'stylesheet' ||
      url.includes('google-analytics') ||
      url.includes('analytics') ||
      url.includes('facebook') ||
      // Bloquear imagens comuns que não sejam a foto do apenado
      (resourceType === 'image' && 
       !url.includes('foto') && 
       !url.includes('photo') && 
       !url.includes('imagem') && 
       !url.includes('getfoto'))
    ) {
      route.abort();
    } else {
      route.continue();
    }
  });
}

async function runScrapeTodasUnidades(jobId: string, fast = false): Promise<void> {
  const job = await prisma.sipeSyncJob.findUnique({ where: { id: jobId } })
  if (!job) throw new Error('Job não encontrado')

  await dbProgress(jobId, {
    log: 'Iniciando sessão no SIPE para sincronização de todas as unidades...',
    fase: 'Login',
  })
  refreshMemory(jobId, { fase: 'Login', ultimoLog: 'Iniciando sessão no SIPE...' })

  const context = await createSession()
  let page = await context.newPage()
  await setupFastPageIfNeeded(page, fast)
  markFallbackSessionDirty(page)

  try {
    setCurrentSipeEngine(globalThis.__sipeCurrentEngine, SIPE_UNIDADE)
    if (isPythonSdkEngine()) {
      log(jobId, 'SDK Python ativado para sincronização de unidades. Playwright ficará em rollback.')
    } else {
      const ok = await login(page, SIPE_UNIDADE)
      if (!ok) throw new Error('Falha no login do SIPE')
      ;(page as any).__sipeAuthenticated = true
      log(jobId, 'Login realizado com sucesso')
    }

    let checkpoint: {
      unidades: Array<{ id: string; nome: string; concluida: boolean; totalApenados?: number }>;
      currentUnidadeId: string | null;
      currentApenadosIds: number[];
    }

    if (job.idsColetados) {
      try {
        checkpoint = JSON.parse(job.idsColetados)
      } catch {
        throw new Error('Falha ao parsear o checkpoint de unidades no banco de dados')
      }
      
      const pendentes = checkpoint.unidades.filter(u => !u.concluida).length
      log(jobId, `Retomando sincronização de unidades. Restam ${pendentes} de ${checkpoint.unidades.length} unidades.`)
      
      const alreadyDone = job.processado ?? 0
      const totalEstimado = alreadyDone + checkpoint.currentApenadosIds.length
      
      refreshMemory(jobId, {
        processado: alreadyDone,
        total: totalEstimado,
        ultimoLog: `Retomando do ID #${job.ultimoIdProcessado ?? 'início'} — ${checkpoint.currentApenadosIds.length} apenados pendentes na unidade atual`,
      })
      await dbProgress(jobId, {
        log: `Retomando da unidade #${checkpoint.currentUnidadeId ?? 'início'} — ${checkpoint.currentApenadosIds.length} apenados pendentes`,
        fase: 'Retomando',
      })
    } else {
      log(jobId, 'Coletando lista completa de unidades prisionais no SIPE...')
      await gotoSipeWithFallback(page, '/selectRole', { waitUntil: 'domcontentloaded', timeout: 20_000 }).catch(async () => {
        await gotoSipeWithFallback(page, '/selectRole/1', { waitUntil: 'domcontentloaded' })
      })
      await page.locator('select').nth(1).waitFor({ state: 'attached', timeout: 15_000 })

      const options = await page.evaluate(() => {
        const selects = document.querySelectorAll('select')
        if (selects.length < 2) return [] as Array<{ id: string; nome: string }>
        const unitSelect = selects[1] as HTMLSelectElement
        return Array.from(unitSelect.options)
          .filter((o) => o.value && o.value !== '' && o.value !== '0')
          .map((o) => ({ id: o.value, nome: (o.textContent ?? '').trim() }))
      })

      if (options.length === 0) {
        throw new Error('Nenhuma unidade prisional encontrada no select do SIPE')
      }

      // Atualiza o cache de unidades do sistema
      globalThis.__sipeUnidadesCache = { data: options, fetchedAt: Date.now() }
      await prisma.systemConfig.upsert({
        where: { key: 'sipe_unidades' },
        create: {
          key: 'sipe_unidades',
          value: options,
          description: 'Cache persistente das unidades prisionais do SIPE',
        },
        update: {
          value: options,
        },
      }).catch(() => {})

      checkpoint = {
        unidades: options.map(u => ({ id: u.id, nome: u.nome, concluida: false })),
        currentUnidadeId: null,
        currentApenadosIds: []
      }

      await dbProgress(jobId, {
        idsColetados: JSON.stringify(checkpoint),
        total: 0,
        processado: 0,
        log: `${options.length} unidades prisionais encontradas. Iniciando varredura sequencial.`,
      })
      refreshMemory(jobId, {
        total: 0,
        processado: 0,
        ultimoLog: `${options.length} unidades encontradas`,
      })
    }

    const totalUnidades = checkpoint.unidades.length
    for (let index = 0; index < totalUnidades; index++) {
      const u = checkpoint.unidades[index]
      if (u.concluida) continue

      if (globalThis.__sipeStopFlag) {
        await dbProgress(jobId, {
          status: 'INTERRUPTED',
          finalizadoEm: new Date(),
          log: 'Sincronização de unidades interrompida pelo usuário',
        })
        refreshMemory(jobId, { status: 'INTERRUPTED' })
        return
      }

      checkpoint.currentUnidadeId = u.id
      const faseMsg = `[${index + 1}/${totalUnidades}] ${u.nome}`
      await dbProgress(jobId, {
        idsColetados: JSON.stringify(checkpoint),
        fase: faseMsg,
        log: `Iniciando processamento da unidade: "${u.nome}" [${index + 1}/${totalUnidades}]`,
      })
      refreshMemory(jobId, {
        fase: faseMsg,
        ultimoLog: `Processando unidade: ${u.nome}`,
      })

      // Coleta os IDs de apenados para a unidade atual se ainda não coletou
      if (checkpoint.currentApenadosIds.length === 0) {
        try {
          checkpoint.currentApenadosIds = await coletarIdsApenados(page, u.id, jobId, u.nome)
          u.totalApenados = checkpoint.currentApenadosIds.length
          
          const totalEstimado = (globalThis.__sipeState?.processado ?? 0) + checkpoint.currentApenadosIds.length
          await dbProgress(jobId, {
            idsColetados: JSON.stringify(checkpoint),
            total: totalEstimado,
            log: `Coletados ${checkpoint.currentApenadosIds.length} apenados na unidade "${u.nome}".`,
          })
          refreshMemory(jobId, {
            total: totalEstimado,
            ultimoLog: `Coletados ${checkpoint.currentApenadosIds.length} apenados`,
          })
        } catch (err) {
          const msg = `Erro ao coletar apenados da unidade "${u.nome}" (ID #${u.id}): ${err}`
          log(jobId, msg)
          
          u.concluida = true
          checkpoint.currentUnidadeId = null
          checkpoint.currentApenadosIds = []
          
          const errosCount = (globalThis.__sipeState?.erros ?? 0) + 1
          if (globalThis.__sipeState) globalThis.__sipeState.erros = errosCount
          
          await dbProgress(jobId, {
            idsColetados: JSON.stringify(checkpoint),
            erros: errosCount,
          })
          continue
        }
      }

      // Processa apenados da unidade atual
      const apenadosIds = [...checkpoint.currentApenadosIds]
      let lastProcessedId: number | undefined
      let checkpointBatchCount = 0; // 🔧 OTIMIZAÇÃO: Batched checkpoints
      let pageRenewCount = 0; // 🔧 OTIMIZAÇÃO: Page renewal

      for (const sipeId of apenadosIds) {
        if (globalThis.__sipeStopFlag) {
          await dbProgress(jobId, {
            status: 'INTERRUPTED',
            finalizadoEm: new Date(),
            log: 'Sincronização de unidades interrompida pelo usuário',
          })
          refreshMemory(jobId, { status: 'INTERRUPTED' })
          return
        }

        // 🔧 OTIMIZAÇÃO: Renovar page instance a cada 25 apenados para evitar memory leak
        if (pageRenewCount % 25 === 0 && pageRenewCount > 0) {
          try {
            log(jobId, `🔄 Renovando page instance após ${pageRenewCount} apenados...`);
            await page.close().catch(() => {});
            page = await context.newPage();
            await setupFastPageIfNeeded(page, fast);
            await login(page, u.id);
            log(jobId, `✅ Page renovada com sucesso`);
          } catch (renewErr) {
            log(jobId, `⚠️ Erro ao renovar page: ${renewErr}. Continuando...`);
          }
        }
        pageRenewCount++;

        try {
          // 📍 OTIMIZAÇÃO: Logging detalhado para rastrear progresso
          const currentIdx = apenadosIds.indexOf(sipeId) + 1;
          const progressMsg = `[${currentIdx}/${apenadosIds.length}] Scraping apenado SIPE ID #${sipeId} na unidade "${u.nome}"...`;

          // Log apenas a cada 10 apenados para não poluir o banco
          if (currentIdx % 10 === 0 || currentIdx === 1 || currentIdx === apenadosIds.length) {
            log(jobId, progressMsg);
          }

          await withRetry(async () => {
            try {
              const apenadoCache = listagemInfoCache.get(sipeId)
              const apenadoUnidadeNome = apenadoCache?.unidadeNome ?? u.nome
              await scrapeApenadoFicha(page, sipeId, apenadoUnidadeNome)
            } catch (err: any) {
              if (err?.message === 'SESSAO_EXPIRADA') {
                log(jobId, `Sessão expirada. Re-autenticando para unidade "${u.nome}"...`)
                await login(page, u.id)
                const apenadoCache = listagemInfoCache.get(sipeId)
                const apenadoUnidadeNome = apenadoCache?.unidadeNome ?? u.nome
                await scrapeApenadoFicha(page, sipeId, apenadoUnidadeNome)
              } else {
                throw err
              }
            }
          })

          lastProcessedId = sipeId
          checkpoint.currentApenadosIds = checkpoint.currentApenadosIds.filter(id => id !== sipeId)
          
          if (globalThis.__sipeState) {
            globalThis.__sipeState.processado++
            if (globalThis.__sipeState.total > 0) {
              globalThis.__sipeState.pct = Math.round(
                (globalThis.__sipeState.processado / globalThis.__sipeState.total) * 100
              )
            }
          }

          // 🔧 OTIMIZAÇÃO: Salvar checkpoint apenas a cada 10 apenados processados (evita JSON grande)
          checkpointBatchCount++;
          if (checkpointBatchCount % 10 === 0 || checkpoint.currentApenadosIds.length === 1) {
            await dbProgress(jobId, {
              processado: globalThis.__sipeState?.processado ?? 0,
              ultimoIdProcessado: sipeId,
              idsColetados: JSON.stringify(checkpoint),
            })
          } else {
            // Update rápido sem checkpoint JSON
            await dbProgress(jobId, {
              processado: globalThis.__sipeState?.processado ?? 0,
              ultimoIdProcessado: sipeId,
            })
          }

          // 🔧 OTIMIZAÇÃO: Delay maior para governos servidores lentos (2-5s), menor no modo fast, e mínimo no modo SDK
          const currentDelay = isPythonSdkEngine() ? 50 : (fast ? (500 + Math.random() * 500) : (2000 + Math.random() * 3000))
          await page.waitForTimeout(currentDelay)
        } catch (err) {
          const errosCount = (globalThis.__sipeState?.erros ?? 0) + 1
          if (globalThis.__sipeState) {
            globalThis.__sipeState.erros = errosCount
          }
          const msg = `Erro apenado #${sipeId} na unidade "${u.nome}" (após 3 tentativas): ${err}`
          if (globalThis.__sipeState) {
            globalThis.__sipeState.ultimoLog = msg
          }
          
          checkpoint.currentApenadosIds = checkpoint.currentApenadosIds.filter(id => id !== sipeId)
          
          await dbProgress(jobId, {
            erros: errosCount,
            log: msg,
            idsColetados: JSON.stringify(checkpoint),
          })
        }
      }

      u.concluida = true
      checkpoint.currentUnidadeId = null
      checkpoint.currentApenadosIds = []

      await dbProgress(jobId, {
        idsColetados: JSON.stringify(checkpoint),
        log: `Concluído processamento da unidade "${u.nome}".`,
      })
      log(jobId, `Unidade "${u.nome}" concluída!`)
    }

    const summary = `Concluído: Sincronização de todas as ${totalUnidades} unidades finalizada. Total de ${globalThis.__sipeState?.processado ?? 0} apenados processados, ${globalThis.__sipeState?.erros ?? 0} erros.`
    globalThis.__sipeState = {
      ...globalThis.__sipeState!,
      status: 'COMPLETED',
      fase: 'Concluído',
      ultimoLog: summary,
    }
    await dbProgress(jobId, {
      status: 'COMPLETED',
      finalizadoEm: new Date(),
      log: summary,
      fase: 'Concluído',
    })

  } finally {
    listagemInfoCache.clear()
    await context.close()
  }
}

let logPromiseChain = Promise.resolve()

function log(jobId: string, msg: string) {
  if (globalThis.__sipeState) globalThis.__sipeState.ultimoLog = msg
  // Enfileira a escrita de log para evitar condições de corrida no banco de dados
  logPromiseChain = logPromiseChain.then(() => dbProgress(jobId, { log: msg })).catch(() => {})
}

// 🔧 OTIMIZAÇÃO: Backoff exponencial com mais tentativas para servidores lentos
async function withRetry<T>(fn: () => Promise<T>, attempts = 5): Promise<T> {
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn()
    } catch (err: any) {
      if (err?.message === 'APENADO_NAO_ENCONTRADO') {
        throw err
      }
      if (i === attempts - 1) throw err

      // Backoff exponencial: 2s, 4s, 8s, 16s, 32s (máximo)
      const delayMs = Math.min(2000 * Math.pow(2, i), 32000);
      console.log(`⏳ [Retry ${i + 1}/${attempts}] Aguardando ${(delayMs / 1000).toFixed(0)}s...`);
      await new Promise(r => setTimeout(r, delayMs));
    }
  }
  throw new Error('unreachable')
}

// Cache temporário para associar dados coletados da listagem geral aos apenados
// 🔄 OTIMIZAÇÃO: Limpeza automática a cada 50 páginas para evitar memory leak
const listagemInfoCache = new Map<number, { cela?: string; situacao?: string; unidadeNome?: string }>();

let lastCacheClearPageCount = 0;

function clearCacheIfNeeded(currentPageCount: number) {
  if (currentPageCount % 50 === 0 && currentPageCount !== lastCacheClearPageCount) {
    const sizeAntes = listagemInfoCache.size;
    // listagemInfoCache.clear(); // 🔧 EVITA LIMPEZA DO CACHE ANTES DA SEGUNDA FASE
    lastCacheClearPageCount = currentPageCount;
    console.log(`♻️ [Page ${currentPageCount}] Cache de listagem preservado para a Fase 2. Tamanho: ${sizeAntes}`);
  }
}

// ── Situações que indicam que o apenado está fora do sistema prisional ──
const SITUACOES_EXTRAMUROS = [
  'Em Liberdade',
  'Solto',
  'Prisão Domiciliar',
  'Evasão / Abandono',
  'Óbito em Fuga',
  'Fuga',
  'Preso Recambiado',
  'Livramento Condicional',
  'DEPEN',
  'Descumprimento de cautelar',
]

async function coletarIdsExtramuros(jobId: string): Promise<number[]> {
  await dbProgress(jobId, { log: 'Consultando banco local por apenados extramuros...', fase: 'Coletando IDs' })

  const apenados = await prisma.sipeApenadoImportado.findMany({
    where: { situacao: { in: SITUACOES_EXTRAMUROS } },
    select: { sipeId: true, situacao: true },
    orderBy: { sipeId: 'asc' },
  })

  const ids = apenados.map((a) => a.sipeId)

  // Resumo por situação para o log
  const porSituacao: Record<string, number> = {}
  for (const a of apenados) {
    const s = a.situacao ?? 'Desconhecido'
    porSituacao[s] = (porSituacao[s] ?? 0) + 1
  }
  const resumo = Object.entries(porSituacao)
    .map(([s, n]) => `${s}: ${n}`)
    .join(', ')

  await dbProgress(jobId, {
    log: `${ids.length} apenados extramuros encontrados — ${resumo}`,
    fase: 'Coletando IDs',
  })

  return ids
}

// ── ID collection ─────────────────────────────────────────────

function extractIdsFromTableHtml(html: string): number[] {
  const $ = cheerio.load(html)
  const ids = new Set<number>()
  
  $('table').each((_, table) => {
    // 1. Achar a coluna de código/id no header
    let codigoColIndex = -1
    $(table).find('thead tr th, thead tr td').each((i, el) => {
      const text = $(el).text().toUpperCase().trim()
      if (text === 'CÓDIGO' || text === 'CODIGO' || text === 'CÓD' || text === 'COD') {
        codigoColIndex = i
      }
    })
    
    // Se não achou a coluna código no header, assume index 1 como padrão para listagem geral
    if (codigoColIndex === -1) {
      codigoColIndex = 1
    }
    
    // 2. Extrair de cada linha no tbody
    $(table).find('tbody tr').each((_, row) => {
      const cells = $(row).find('td, th')
      if (cells.length > codigoColIndex) {
        const cellText = $(cells[codigoColIndex]).text().trim()
        const id = parseInt(cellText, 10)
        if (!isNaN(id) && id > 0) {
          ids.add(id)
        }
      }
    })
  })
  
  return [...ids]
}

async function fetchPageWithRetry(
  path: string,
  jobId: string,
  maxRetries = 5
): Promise<string | null> {
  let attempt = 0
  let delay = 1000
  while (attempt < maxRetries) {
    try {
      const proxyData = await fetchSipeViaProxy(path)
      const html = proxyData?.html ?? proxyData?.text
      if (html && html.length > 500 && !html.includes('id="login-form"')) {
        return html
      }
      log(jobId, `⚠️ [PYTHON PROXY] Página ${path} veio incompleta, vazia ou na tela de login. Tentativa ${attempt + 1}/${maxRetries}...`)
    } catch (err: any) {
      log(jobId, `⚠️ [PYTHON PROXY] Erro ao carregar página ${path}: ${err?.message || err}. Tentativa ${attempt + 1}/${maxRetries}...`)
    }
    attempt++
    if (attempt < maxRetries) {
      await new Promise(r => setTimeout(r, delay))
      delay = Math.min(delay * 2, 8000) // Backoff exponencial limitado a 8s
    }
  }
  return null
}

/**
 * Normaliza uma string de nome de unidade para comparação tolerante.
 */
function normalizarNomeUnidade(nome: string): string {
  return nome
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove acentos
    .replace(/[^a-z0-9]/g, '')       // Remove caracteres não alfanuméricos
    .trim()
}

/**
 * Resolve o ID do SIPE para uma unidade prisional a partir do seu nome,
 * consultando o cache em memória e o banco de dados.
 */
async function resolveUnidadeIdByNome(nomeUnidade: string): Promise<string | null> {
  if (!nomeUnidade) return null

  // 1. Tentar obter do cache em memória
  let unidades: { id: string; nome: string }[] = globalThis.__sipeUnidadesCache?.data ?? []

  // 2. Se não estiver no cache em memória, buscar do banco de dados
  if (unidades.length === 0) {
    try {
      const config = await prisma.systemConfig.findUnique({
        where: { key: 'sipe_unidades' }
      })
      if (config && Array.isArray(config.value)) {
        unidades = config.value as any
        globalThis.__sipeUnidadesCache = { data: unidades, fetchedAt: Date.now() }
      }
    } catch (err) {
      console.error(`[SIPE SCRAPER] Erro ao carregar unidades do banco:`, err)
    }
  }

  if (unidades.length === 0) {
    return null
  }

  const nomeNormalizado = normalizarNomeUnidade(nomeUnidade)
  if (!nomeNormalizado) return null

  // Tentar match exato normalizado
  let match = unidades.find(u => normalizarNomeUnidade(u.nome) === nomeNormalizado)
  if (match) return match.id

  // Tentar inclusão normalizada (se o nome da unidade no apenado está contido no nome completo cadastrado, ou vice-versa)
  match = unidades.find(u => {
    const uNorm = normalizarNomeUnidade(u.nome)
    return uNorm.includes(nomeNormalizado) || nomeNormalizado.includes(uNorm)
  })
  if (match) return match.id

  return null
}

/**
 * Altera a unidade ativa da sessão no navegador Playwright se ela for diferente da desejada.
 */
async function switchPlaywrightUnit(page: Page, unidadeId: string, jobId: string): Promise<boolean> {
  try {
    // Garante que o menu superior carregou completamente antes de inspecionar
    await page.waitForSelector('a[name="btnMudaUnidade"]', { timeout: 5_000 }).catch(() => {})

    let unidadeAtiva = await page.evaluate(() => {
      const el = document.querySelector('a[name="btnMudaUnidade"]') as HTMLAnchorElement | null
      return el ? el.getAttribute('title')?.toUpperCase().trim() || '' : ''
    }).catch(() => '')

    // Precisamos saber qual o nome esperado para esta unidadeId para comparar.
    const unidades: { id: string; nome: string }[] = globalThis.__sipeUnidadesCache?.data ?? []
    const unidadeDesejadaObj = unidades.find(u => u.id === unidadeId)
    if (!unidadeDesejadaObj) {
      return false
    }
    const esperadaClean = unidadeDesejadaObj.nome.toUpperCase().trim()

    // Se a unidade ativa já for a esperada, não faz nada
    if (unidadeAtiva && (unidadeAtiva.includes(esperadaClean) || esperadaClean.includes(unidadeAtiva))) {
      return true
    }

    log(jobId, `⚠️ Troca de unidade necessária! Unidade ativa na sessão: "${unidadeAtiva}" | Desejada: "${esperadaClean}" (#${unidadeId}). Alterando...`)

    // Vai para a tela de seleção de papel
    await gotoSipeWithFallback(page, '/selectRole/1', { waitUntil: 'domcontentloaded', timeout: 20_000 }).catch(async () => {
      await gotoSipeWithFallback(page, '/selectRole', { waitUntil: 'domcontentloaded', timeout: 20_000 })
    })

    await page.locator('select').nth(0).waitFor({ state: 'attached', timeout: 10_000 })
    await page.locator('select').nth(1).waitFor({ state: 'attached', timeout: 10_000 })

    // 1. Altera perfil
    await page.evaluate((perfil) => {
      const selects = document.querySelectorAll('select')
      const selectPerfil = selects[0] as HTMLSelectElement
      if (selectPerfil) {
        selectPerfil.value = perfil
        selectPerfil.dispatchEvent(new Event('change', { bubbles: true }))
        const w = window as any
        if (w.$) {
          try {
            w.$(selectPerfil).trigger('chosen:updated')
            w.$(selectPerfil).trigger('change')
          } catch {}
        }
      }
    }, SIPE_PERFIL)

    // 2. Aguarda o AJAX popular as unidades para este perfil
    try {
      await page.waitForFunction((unidade) => {
        const selects = document.querySelectorAll('select')
        const selectUnidade = selects[1] as HTMLSelectElement
        if (!selectUnidade) return false
        const options = Array.from(selectUnidade.options)
        return options.some(opt => opt.value === unidade)
      }, unidadeId, { timeout: 10_000 })
    } catch (err) {
      // Fallback
    }

    // 3. Altera a unidade
    await page.evaluate((unidade) => {
      const selects = document.querySelectorAll('select')
      const selectUnidade = selects[1] as HTMLSelectElement
      if (selectUnidade) {
        selectUnidade.value = unidade
        selectUnidade.dispatchEvent(new Event('change', { bubbles: true }))
        const w = window as any
        if (w.$) {
          try {
            w.$(selectUnidade).trigger('chosen:updated')
            w.$(selectUnidade).trigger('change')
          } catch {}
        }
      }
    }, unidadeId)

    // 4. Pequeno delay de propagação
    await page.waitForTimeout(500)

    const submitBtn = (await page.$('button[type="submit"]')) ?? (await page.$('input[type="submit"]'))
    if (submitBtn) {
      await submitBtn.click()
      await page.waitForURL('**/home**', { timeout: 20_000 })
      
      // Validação final de confirmação
      await page.waitForSelector('a[name="btnMudaUnidade"]', { timeout: 10_000 }).catch(() => {})
      unidadeAtiva = await page.evaluate(() => {
        const el = document.querySelector('a[name="btnMudaUnidade"]') as HTMLAnchorElement | null
        return el ? el.getAttribute('title')?.toUpperCase().trim() || '' : ''
      }).catch(() => '')
      
      log(jobId, `✅ Unidade após troca de papel no SIPE: "${unidadeAtiva}"`)
      return true
    }
  } catch (err) {
    log(jobId, `⚠️ Falha ao alterar unidade ativa no menu: ${err}`)
  }
  return false
}

async function coletarIdsApenados(
  page: Page,
  unidadeId: string,
  jobId: string,
  unidadeNomeEsperada?: string | null,
  globalMode = false
): Promise<number[]> {
  if (isPythonSdkEngine()) {
    if (globalMode) {
      log(jobId, '🐍 Iniciando paginação paralela em lotes para a listagem global...')
      const idsAcumulados = new Set<number>()

      // 1. Carrega a primeira página para ler o total de páginas
      const firstHtml = await fetchPageWithRetry('/apenados/index', jobId)
      if (!firstHtml) {
        throw new Error('Falha crítica ao carregar a página inicial da listagem global do SIPE.')
      }

      // Extrair IDs e celas da página 1
      const idsPage1 = extractIdsFromTableHtml(firstHtml)
      idsPage1.forEach(id => idsAcumulados.add(id))

      const $first = cheerio.load(firstHtml)
      $first('table').first().each((_, table) => {
        let codigoColIndex = -1
        let celaColIndex = -1
        let situacaoColIndex = -1
        let unidadeColIndex = -1
        $first(table).find('thead tr th, thead tr td').each((i, el) => {
          const text = $first(el).text().toUpperCase().trim()
          if (text === 'CÓDIGO' || text === 'CODIGO' || text === 'CÓD' || text === 'COD') codigoColIndex = i
          if (text === 'CELA') celaColIndex = i
          if (text === 'SITUAÇÃO' || text === 'SITUACAO' || text === 'STATUS' || text === 'SITUAÇAO') situacaoColIndex = i
          if (text.includes('UNID') || text.includes('ESTAB') || text.includes('LOCAL') || text.includes('ORGAO') || text.includes('ORGÃO')) unidadeColIndex = i
        })
        if (codigoColIndex === -1) codigoColIndex = 1
        $first(table).find('tbody tr').each((_, row) => {
          const cells = $first(row).find('td, th')
          if (cells.length > codigoColIndex) {
            const idVal = parseInt($first(cells[codigoColIndex]).text().trim(), 10)
            const celaText = celaColIndex >= 0 && cells.length > celaColIndex ? $first(cells[celaColIndex]).text().trim() : undefined
            const situacaoText = situacaoColIndex >= 0 && cells.length > situacaoColIndex ? $first(cells[situacaoColIndex]).text().trim() : undefined
            const unidadeText = unidadeColIndex >= 0 && cells.length > unidadeColIndex ? $first(cells[unidadeColIndex]).text().trim() : undefined
            
            if (!isNaN(idVal) && idVal > 0) {
              const cacheData: any = {}
              if (celaText) cacheData.cela = celaText
              if (situacaoText) cacheData.situacao = situacaoText
              if (unidadeText) cacheData.unidadeNome = unidadeText
              listagemInfoCache.set(idVal, cacheData)
            }
          }
        })
      })

      // 2. Extrai maxPage
      let maxPage = 1
      $first('ul.pagination li a, .pagination li a').each((_, el) => {
        const text = $first(el).text().trim()
        const pageNum = parseInt(text, 10)
        if (!isNaN(pageNum) && pageNum > maxPage) {
          maxPage = pageNum
        }
        const href = $first(el).attr('href') || ''
        const match = href.match(/page=(\d+)/)
        if (match) {
          const pageVal = parseInt(match[1], 10)
          if (!isNaN(pageVal) && pageVal > maxPage) {
            maxPage = pageVal
          }
        }
      })

      log(jobId, `📊 Listagem global do SIPE possui o total de ${maxPage} páginas de apenados.`)

      const testMode = (globalThis as any).SCRAPING_TESTE_MODE === true
      const pageLimit = testMode ? Math.min(5, maxPage) : maxPage

      const pagesToFetch: string[] = []
      for (let i = 2; i <= pageLimit; i++) {
        pagesToFetch.push(`/apenados/index?page=${i}`)
      }

      // 3. Processar em lotes de 15 requisições concorrentes
      const LOTE_SIZE = 15
      for (let i = 0; i < pagesToFetch.length; i += LOTE_SIZE) {
        if (globalThis.__sipeStopFlag) {
          log(jobId, '🛑 Coleta global do SDK Python interrompida.')
          break
        }
        const lote = pagesToFetch.slice(i, i + LOTE_SIZE)
        log(jobId, `🐍 Carregando lote de páginas ${i + 2} até ${Math.min(i + 2 + lote.length - 1, pageLimit)} (concorrentes)...`)

        const results = await Promise.all(
          lote.map(async (path) => {
            const html = await fetchPageWithRetry(path, jobId)
            if (!html) {
              throw new Error(`Falha crítica ao obter o HTML da listagem para o path: ${path}`)
            }
            return { path, html }
          })
        )

        for (const { html } of results) {
          const idsPagina = extractIdsFromTableHtml(html)
          if (idsPagina.length === 0) {
            const idsRegex = extractIdsFromHtml(html, 'apenados')
            idsRegex.forEach(id => idsAcumulados.add(id))
          } else {
            idsPagina.forEach(id => idsAcumulados.add(id))
          }

          // Celas e situações de cada página do lote
          const $page = cheerio.load(html)
          $page('table').first().each((_, table) => {
            let codigoColIndex = -1
            let celaColIndex = -1
            let situacaoColIndex = -1
            let unidadeColIndex = -1
            $page(table).find('thead tr th, thead tr td').each((c, el) => {
              const text = $page(el).text().toUpperCase().trim()
              if (text === 'CÓDIGO' || text === 'CODIGO' || text === 'CÓD' || text === 'COD') codigoColIndex = c
              if (text === 'CELA') celaColIndex = c
              if (text === 'SITUAÇÃO' || text === 'SITUACAO' || text === 'STATUS' || text === 'SITUAÇAO') situacaoColIndex = c
              if (text.includes('UNID') || text.includes('ESTAB') || text.includes('LOCAL') || text.includes('ORGAO') || text.includes('ORGÃO')) unidadeColIndex = c
            })
            if (codigoColIndex === -1) codigoColIndex = 1
            $page(table).find('tbody tr').each((_, row) => {
              const cells = $page(row).find('td, th')
              if (cells.length > codigoColIndex) {
                const idVal = parseInt($page(cells[codigoColIndex]).text().trim(), 10)
                const celaText = celaColIndex >= 0 && cells.length > celaColIndex ? $page(cells[celaColIndex]).text().trim() : undefined
                const situacaoText = situacaoColIndex >= 0 && cells.length > situacaoColIndex ? $page(cells[situacaoColIndex]).text().trim() : undefined
                const unidadeText = unidadeColIndex >= 0 && cells.length > unidadeColIndex ? $page(cells[unidadeColIndex]).text().trim() : undefined
                
                if (!isNaN(idVal) && idVal > 0) {
                  const cacheData: any = {}
                  if (celaText) cacheData.cela = celaText
                  if (situacaoText) cacheData.situacao = situacaoText
                  if (unidadeText) cacheData.unidadeNome = unidadeText
                  
                  const existing = listagemInfoCache.get(idVal) || {}
                  listagemInfoCache.set(idVal, { ...existing, ...cacheData })
                }
              }
            })
          })
        }

        // Polite delay entre lotes paralelos
        await new Promise(r => setTimeout(r, 600 + Math.random() * 400))
      }

      const totalIds = Array.from(idsAcumulados)
      log(jobId, `🐍 SDK Python concluiu a coleta global. Total: ${totalIds.length} IDs obtidos.`)
      return totalIds
    }

    // Modo não-global (por unidade) - Sequencial com Retries
    const candidatePaths = ['/listagem/geral', `/listagem/${unidadeId}/carceragem`]

    for (const basePath of candidatePaths) {
      const idsAcumulados: number[] = []
      let currentPath: string | null = basePath
      let pageNum = 1
      const testMode = (globalThis as any).SCRAPING_TESTE_MODE === true
      const maxIds = testMode ? 150 : Infinity

      while (currentPath) {
        if (globalThis.__sipeStopFlag) {
          log(jobId, '🛑 Coleta por unidade do SDK Python interrompida.')
          break
        }
        log(jobId, `🐍 SDK Python carregando página ${pageNum} da listagem por unidade: ${currentPath}`)
        const html = await fetchPageWithRetry(currentPath, jobId)
        if (!html) {
          throw new Error(`Falha crítica ao obter o HTML da listagem por unidade no path: ${currentPath}`)
        }

        const idsPagina = extractIdsFromTableHtml(html)
        if (idsPagina.length === 0) {
          const idsRegex = extractIdsFromHtml(html, 'apenados')
          if (idsRegex.length > 0) {
            idsPagina.push(...idsRegex)
          }
        }

        for (const id of idsPagina) {
          if (!idsAcumulados.includes(id)) {
            idsAcumulados.push(id)
          }
        }

        const $page = cheerio.load(html)
        $page('table').first().each((_, table) => {
          let codigoColIndex = -1
          let celaColIndex = -1
          let situacaoColIndex = -1
          let unidadeColIndex = -1
          $page(table).find('thead tr th, thead tr td').each((c, el) => {
            const text = $page(el).text().toUpperCase().trim()
            if (text === 'CÓDIGO' || text === 'CODIGO' || text === 'CÓD' || text === 'COD') codigoColIndex = c
            if (text === 'CELA') celaColIndex = c
            if (text === 'SITUAÇÃO' || text === 'SITUACAO' || text === 'STATUS' || text === 'SITUAÇAO') situacaoColIndex = c
            if (text.includes('UNID') || text.includes('ESTAB') || text.includes('LOCAL') || text.includes('ORGAO') || text.includes('ORGÃO')) unidadeColIndex = c
          })
          if (codigoColIndex === -1) codigoColIndex = 1
          $page(table).find('tbody tr').each((_, row) => {
            const cells = $page(row).find('td, th')
            if (cells.length > codigoColIndex) {
              const idVal = parseInt($page(cells[codigoColIndex]).text().trim(), 10)
              const celaText = celaColIndex >= 0 && cells.length > celaColIndex ? $page(cells[celaColIndex]).text().trim() : undefined
              const situacaoText = situacaoColIndex >= 0 && cells.length > situacaoColIndex ? $page(cells[situacaoColIndex]).text().trim() : undefined
              const unidadeText = unidadeColIndex >= 0 && cells.length > unidadeColIndex ? $page(cells[unidadeColIndex]).text().trim() : undefined
              
              if (!isNaN(idVal) && idVal > 0) {
                const cacheData: any = {}
                if (celaText) cacheData.cela = celaText
                if (situacaoText) cacheData.situacao = situacaoText
                if (unidadeText) cacheData.unidadeNome = unidadeText
                
                const existing = listagemInfoCache.get(idVal) || {}
                listagemInfoCache.set(idVal, { ...existing, ...cacheData })
              }
            }
          })
        })

        if (testMode && idsAcumulados.length >= maxIds) {
          log(jobId, `🧪 [TESTE] Limite de 150 IDs atingido na listagem por unidade.`)
          break
        }

        // Extração robusta do próximo link
        let nextLinkEl = $page('ul.pagination li a[rel="next"]')
        if (!nextLinkEl.length) nextLinkEl = $page('a:contains("Próxima")')
        if (!nextLinkEl.length) nextLinkEl = $page('a:contains("Next")')
        if (!nextLinkEl.length) nextLinkEl = $page('li.next a, li.next > a')
        if (!nextLinkEl.length) nextLinkEl = $page('[data-dt-idx="next"] a, [data-dt-idx="next"]')
        if (!nextLinkEl.length) nextLinkEl = $page('a:contains("»")')
        if (!nextLinkEl.length) nextLinkEl = $page('a:contains(">>")')

        const nextUrl = nextLinkEl.first().attr('href')
        const parentLi = nextLinkEl.first().closest('li')
        const isDisabled = parentLi.hasClass('disabled') || nextLinkEl.first().hasClass('disabled')

        if (nextUrl && !isDisabled) {
          let relPath = nextUrl
          if (relPath.startsWith('http://') || relPath.startsWith('https://')) {
            try {
              const parsed = new URL(relPath)
              relPath = parsed.pathname + parsed.search
            } catch {
              relPath = relPath.replace(SIPE_URL, '').replace('http://sipe.sejus.ro.gov.br', '')
            }
          }
          currentPath = relPath
          pageNum++
          await new Promise(r => setTimeout(r, 800 + Math.random() * 500))
        } else {
          currentPath = null
        }
      }

      if (idsAcumulados.length > 0) {
        if (testMode && idsAcumulados.length > 150) {
          idsAcumulados.splice(150)
        }
        log(jobId, `🐍 SDK Python concluiu a coleta por unidade. Total: ${idsAcumulados.length} IDs obtidos.`)
        return idsAcumulados
      }
    }

    log(jobId, '⚠️ SDK Python não conseguiu coletar IDs das listagens de unidade. Ativando rollback via Playwright.')
  }

  // Validação da unidade ativa no menu superior do SIPE para garantir a troca correta
  if (!globalMode && unidadeNomeEsperada) {
    await switchPlaywrightUnit(page, unidadeId, jobId)
  }

  if (globalMode) {
    log(jobId, `Acessando listagem global cross-unit: ${SIPE_URL}/apenados/index`)
    await gotoSipeWithFallback(page, '/apenados/index', {
      waitUntil: 'domcontentloaded',
      timeout: 45_000,
    })
    await page.waitForSelector('table', { timeout: 30_000 })
  } else {
    let tableFound = false
    try {
      log(jobId, `Acessando listagem geral: ${SIPE_URL}/listagem/geral`)
      await gotoSipeWithFallback(page, '/listagem/geral', {
        waitUntil: 'domcontentloaded',
        timeout: 20_000,
      })
      await page.waitForSelector('table', { timeout: 15_000 })
      tableFound = true
    } catch (err) {
      log(jobId, `⚠️ Falha ao carregar listagem geral, tentando carceragem...`)
    }

    if (!tableFound) {
      await gotoSipeWithFallback(page, `/listagem/${unidadeId}/carceragem`, {
        waitUntil: 'domcontentloaded',
        timeout: 30_000,
      })
      await page.waitForSelector('table', { timeout: 30_000 })
    }
  }

  // ── Estratégia A: DataTables JS API ──────────────────────────
  // Consulta o objeto DataTables diretamente na memória da página.
  // Em modo client-side, dt.rows() retorna TODAS as linhas independente de paginação.
  // Em modo server-side, retorna apenas a página atual (estratégia B cobre esse caso).
  const apenadosViaApi = await page.evaluate(() => {
    try {
      const w = window as any
      // Suporte a DataTables 1.x (fnTables) e 2.x (tables())
      const tables: Element[] =
        w.$.fn?.dataTable?.fnTables?.(true) ??
        w.DataTable?.tables?.({ visible: true, hidden: false }) ??
        []
      if (!tables.length) return []
      const dt = w.$(tables[0]).DataTable()
      
      // Se a tabela possuir mais de uma página, significa que está paginada no servidor.
      // Nesse caso, a Estratégia A em memória não obterá todos os dados; abortamos para ir para a B ou C.
      const info = dt.page.info()
      if (info.pages > 1) {
        return []
      }

      // Descobre os índices de código, cela, situação e unidade na tabela
      const headers = Array.from(document.querySelectorAll('table thead th, table thead td'))
      const codigoIndex = headers.findIndex(h => {
        const text = (h.textContent ?? '').toUpperCase().trim()
        return text === 'CÓDIGO' || text === 'CODIGO' || text === 'CÓD' || text === 'COD'
      })
      const celaIndex = headers.findIndex(h => (h.textContent ?? '').toUpperCase().trim() === 'CELA')
      const situacaoIndex = headers.findIndex(h => {
        const text = (h.textContent ?? '').toUpperCase().trim()
        return text === 'SITUAÇÃO' || text === 'SITUACAO' || text === 'STATUS' || text === 'SITUAÇAO'
      })
      const unidadeIndex = headers.findIndex(h => {
        const text = (h.textContent ?? '').toUpperCase().trim()
        return text.includes('UNID') || text.includes('ESTAB') || text.includes('LOCAL') || text.includes('ORGAO') || text.includes('ORGÃO')
      })

      const data: any[] = dt.rows().data().toArray()
      return data
        .map((row: any) => {
          let id = NaN
          let cela = ''
          let situacao = ''
          let unidadeNome = ''
          if (Array.isArray(row)) {
            id = parseInt(row[codigoIndex >= 0 ? codigoIndex : 0])
            if (celaIndex >= 0) cela = (row[celaIndex] ?? '').toString().trim()
            if (situacaoIndex >= 0) situacao = (row[situacaoIndex] ?? '').toString().trim()
            if (unidadeIndex >= 0) unidadeNome = (row[unidadeIndex] ?? '').toString().trim()
          } else if (row) {
            id = parseInt(row.id ?? row.sipeId ?? '')
            cela = (row.cela ?? '').toString().trim()
            situacao = (row.situacao ?? row.status ?? '').toString().trim()
            unidadeNome = (row.unidade ?? row.unidadeNome ?? '').toString().trim()
          }
          return { id, cela, situacao, unidadeNome }
        })
        .filter(item => !isNaN(item.id) && item.id > 0)
    } catch { return [] }
  }).catch(() => [])

  if (apenadosViaApi.length > 0) {
    // Modo teste: limitar a 150 IDs
    const testMode = (globalThis as any).SCRAPING_TESTE_MODE === true
    let idsFinais = [...new Set(apenadosViaApi.map(item => item.id))]

    if (testMode && idsFinais.length > 150) {
      console.log(`[TESTE] Limitando de ${idsFinais.length} para 150 IDs`)
      idsFinais = idsFinais.slice(0, 150)
    }

    log(jobId, `⚡ Estratégia A (DataTables JS API): ${idsFinais.length} IDs`)
    for (const item of apenadosViaApi) {
      const cacheData: any = {}
      if (item.cela) cacheData.cela = item.cela
      if (item.situacao) cacheData.situacao = item.situacao
      if (item.unidadeNome) cacheData.unidadeNome = item.unidadeNome
      if (Object.keys(cacheData).length > 0) {
        listagemInfoCache.set(item.id, cacheData)
      }
    }
    return idsFinais
  }

  log(jobId, '⚠️ Estratégia A sem resultado — tentando estratégia B (fetch direto paginado)')

  // ── Estratégia B: fetch direto com cookies de sessão (paginado em lotes) ──
  // Obtém a URL AJAX do DataTables e realiza requisições de API sequenciais em lotes
  // para burlar o limite do servidor, sendo infinitamente mais rápido que clicks no DOM.
  const apenadosViaFetch = await page.evaluate(async (baseUrl: string) => {
    try {
      const w = window as any
      const tables: Element[] = w.$.fn?.dataTable?.fnTables?.(true) ?? []
      if (!tables.length) return []
      const dt = w.$(tables[0]).DataTable()
      const settings = dt.settings()[0]
      const rawUrl: string = settings?.ajax?.url ?? settings?.ajax ?? settings?.sAjaxSource ?? ''
      if (!rawUrl) return []
      const ajaxUrl = rawUrl.startsWith('http') ? rawUrl : baseUrl + rawUrl

      // Descobre os índices de código, cela, situação e unidade na tabela
      const headers = Array.from(document.querySelectorAll('table thead th, table thead td'))
      const codigoIndex = headers.findIndex(h => {
        const text = (h.textContent ?? '').toUpperCase().trim()
        return text === 'CÓDIGO' || text === 'CODIGO' || text === 'CÓD' || text === 'COD'
      })
      const celaIndex = headers.findIndex(h => (h.textContent ?? '').toUpperCase().trim() === 'CELA')
      const situacaoIndex = headers.findIndex(h => {
        const text = (h.textContent ?? '').toUpperCase().trim()
        return text === 'SITUAÇÃO' || text === 'SITUACAO' || text === 'STATUS' || text === 'SITUAÇAO'
      })
      const unidadeIndex = headers.findIndex(h => {
        const text = (h.textContent ?? '').toUpperCase().trim()
        return text.includes('UNID') || text.includes('ESTAB') || text.includes('LOCAL') || text.includes('ORGAO') || text.includes('ORGÃO')
      })

      let allRows: any[] = []
      let start = 0
      const length = 500 // Lote seguro e de alto desempenho
      let draw = 1
      let hasMore = true

      // Modo teste: limitar a 150 IDs
      const testMode = (globalThis as any).SCRAPING_TESTE_MODE === true
      const maxIds = testMode ? 150 : Infinity

      while (hasMore) {
        const params = new URLSearchParams({
          draw: String(draw++),
          start: String(start),
          length: String(length),
          'columns[0][data]': '0',
          'order[0][column]': '0',
          'order[0][dir]': 'asc',
        })

        const res = await fetch(ajaxUrl, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: params.toString(),
        })

        if (!res.ok) break

        const json = await res.json()
        const rows: any[] = json?.data ?? json?.aaData ?? []
        if (rows.length === 0) break

        allRows = allRows.concat(rows)

        const totalRecords = json.recordsFiltered ?? json.recordsTotal ?? rows.length
        start += length

        // Modo teste: parar ao atingir 150 IDs
        if (testMode && allRows.length >= maxIds) {
          console.log(`[TESTE] Limite de ${maxIds} IDs atingido, parando coleta`)
          hasMore = false
          break
        }

        // Se já puxamos tudo ou se o lote atual retornou menos que o solicitado (fim da lista)
        if (allRows.length >= totalRecords || rows.length < length) {
          hasMore = false
        }
      }

      return allRows
        .map((row: any) => {
          let id = NaN
          let cela = ''
          let situacao = ''
          let unidadeNome = ''
          if (Array.isArray(row)) {
            id = parseInt(row[codigoIndex >= 0 ? codigoIndex : 0])
            if (celaIndex >= 0) cela = (row[celaIndex] ?? '').toString().trim()
            if (situacaoIndex >= 0) situacao = (row[situacaoIndex] ?? '').toString().trim()
            if (unidadeIndex >= 0) unidadeNome = (row[unidadeIndex] ?? '').toString().trim()
          } else if (row) {
            id = parseInt(row.id ?? row.sipeId ?? '')
            cela = (row.cela ?? '').toString().trim()
            situacao = (row.situacao ?? row.status ?? '').toString().trim()
            unidadeNome = (row.unidade ?? row.unidadeNome ?? '').toString().trim()
          }
          return { id, cela, situacao, unidadeNome }
        })
        .filter(item => !isNaN(item.id) && item.id > 0)
    } catch { return [] }
  }, SIPE_URL).catch(() => [])

  if (apenadosViaFetch.length > 0) {
    // Modo teste: limitar a 150 IDs
    const testMode = (globalThis as any).SCRAPING_TESTE_MODE === true
    let idsFinais = [...new Set(apenadosViaFetch.map(item => item.id))]

    if (testMode && idsFinais.length > 150) {
      console.log(`[TESTE] Limitando de ${idsFinais.length} para 150 IDs`)
      idsFinais = idsFinais.slice(0, 150)
    }

    log(jobId, `⚡ Estratégia B (fetch direto paginado): ${idsFinais.length} IDs`)
    for (const item of apenadosViaFetch) {
      const cacheData: any = {}
      if (item.cela) cacheData.cela = item.cela
      if (item.situacao) cacheData.situacao = item.situacao
      if (item.unidadeNome) cacheData.unidadeNome = item.unidadeNome
      if (Object.keys(cacheData).length > 0) {
        listagemInfoCache.set(item.id, cacheData)
      }
    }
    return idsFinais
  }

  log(jobId, '⚠️ Estratégia B sem resultado — usando estratégia C (DOM + paginação)')

  // ── Estratégia C: DOM + paginação com saída inteligente ──────
  // Força DataTables a exibir todas as linhas via API JS antes de ler o DOM.
  await page.evaluate(() => {
    try {
      const w = window as any
      const tables: Element[] = w.$.fn?.dataTable?.fnTables?.(true) ?? []
      if (tables.length) w.$(tables[0]).DataTable().page.len(-1).draw()
    } catch { /* DataTables não disponível */ }
  }).catch(() => {})
  await page.waitForTimeout(1500)

  // Limpa o cache a cada nova coleta
  listagemInfoCache.clear()

  // Descobre dinamicamente qual coluna se refere ao código do apenado (SIPE ID)
  const codigoColIndex = await page.evaluate(() => {
    try {
      const headers = Array.from(document.querySelectorAll('table thead th, table thead td'))
      const index = headers.findIndex(h => {
        const text = (h.textContent ?? '').toUpperCase().trim()
        return text === 'CÓDIGO' || text === 'CODIGO' || text === 'CÓD' || text === 'COD'
      })
      return index >= 0 ? index : 0
    } catch { return 0 }
  }).catch(() => 0)

  // Descobre dinamicamente qual coluna se refere à cela do apenado
  const celaColIndex = await page.evaluate(() => {
    try {
      const headers = Array.from(document.querySelectorAll('table thead th, table thead td'))
      return headers.findIndex(h => (h.textContent ?? '').toUpperCase().trim() === 'CELA')
    } catch { return -1 }
  }).catch(() => -1)

  // Descobre dinamicamente qual coluna se refere à situação do apenado
  const situacaoColIndex = await page.evaluate(() => {
    try {
      const headers = Array.from(document.querySelectorAll('table thead th, table thead td'))
      return headers.findIndex(h => {
        const text = (h.textContent ?? '').toUpperCase().trim()
        return text === 'SITUAÇÃO' || text === 'SITUACAO' || text === 'STATUS' || text === 'SITUAÇAO'
      })
    } catch { return -1 }
  }).catch(() => -1)

  // Descobre dinamicamente qual coluna se refere à unidade prisional do apenado
  const unidadeColIndex = await page.evaluate(() => {
    try {
      const headers = Array.from(document.querySelectorAll('table thead th, table thead td'))
      return headers.findIndex(h => {
        const text = (h.textContent ?? '').toUpperCase().trim()
        return text.includes('UNID') || text.includes('ESTAB') || text.includes('LOCAL') || text.includes('ORGAO') || text.includes('ORGÃO')
      })
    } catch { return -1 }
  }).catch(() => -1)

  log(jobId, `🔍 Identificada coluna de IDs na posição (0-index): ${codigoColIndex}`)
  if (celaColIndex >= 0) {
    log(jobId, `🔍 Identificada coluna de CELA na posição (0-index): ${celaColIndex}`)
  }
  if (situacaoColIndex >= 0) {
    log(jobId, `🔍 Identificada coluna de SITUAÇÃO na posição (0-index): ${situacaoColIndex}`)
  }
  if (unidadeColIndex >= 0) {
    log(jobId, `🔍 Identificada coluna de UNIDADE na posição (0-index): ${unidadeColIndex}`)
  }

  const ids = new Set<number>()

  const extractIds = async () => {
    const rows = await page.$$('table tbody tr')
    log(jobId, `📊 <tr> visíveis no DOM: ${rows.length}`)
    for (const row of rows) {
      const cells = await row.$$('td, th')
      if (cells.length <= codigoColIndex) continue
      
      const idCell = cells[codigoColIndex]
      if (!idCell) continue
      const id = parseInt((await idCell.innerText()).trim())
      if (isNaN(id)) continue

      ids.add(id)

      const cacheObj: any = {}
      // Salva a cela correspondente no cache em memória
      if (celaColIndex >= 0 && cells.length > celaColIndex) {
        const celaText = (await cells[celaColIndex].innerText()).trim()
        if (celaText) cacheObj.cela = celaText
      }
      // Salva a situação correspondente no cache em memória
      if (situacaoColIndex >= 0 && cells.length > situacaoColIndex) {
        const situacaoText = (await cells[situacaoColIndex].innerText()).trim()
        if (situacaoText) cacheObj.situacao = situacaoText
      }
      // Salva a unidade correspondente no cache em memória
      if (unidadeColIndex >= 0 && cells.length > unidadeColIndex) {
        const unidadeText = (await cells[unidadeColIndex].innerText()).trim()
        if (unidadeText) cacheObj.unidadeNome = unidadeText
      }

      if (Object.keys(cacheObj).length > 0) {
        const existing = listagemInfoCache.get(id) || {}
        listagemInfoCache.set(id, { ...existing, ...cacheObj })
      }
    }
  }

  await extractIds()

  let pageNum = 1
  let emptyConsecutivos = 0
  const MAX_VAZIAS = 3
  let continuar = true
  while (continuar) {
    if (globalThis.__sipeStopFlag) {
      log(jobId, '🛑 Paginação do Playwright interrompida.')
      break
    }
    const botaoLocator = page
      .locator('a:has-text("Próxima"), a:has-text("Next"), li.next > a, [data-dt-idx="next"] a, a:has-text("»"), a:has-text(">>")')
      .first()
    const botaoVisivel = await botaoLocator.isVisible().catch(() => false)
    if (!botaoVisivel) {
      log(jobId, `📄 Fim da paginação (página ${pageNum})`)
      break
    }
    const botaoDisabled = await botaoLocator.evaluate((el: Element) =>
      el.closest('li')?.classList.contains('disabled') ||
      el.classList.contains('disabled') ||
      (el as HTMLAnchorElement).tabIndex === -1
    ).catch(() => false)
    if (botaoDisabled) {
      log(jobId, `📄 Fim da paginação — botão desabilitado (página ${pageNum})`)
      break
    }

    try {
      pageNum++

      // 🔧 OTIMIZAÇÃO: Limpeza de cache a cada 50 páginas
      clearCacheIfNeeded(pageNum);

      // 🔧 OTIMIZAÇÃO: Delay aumentado entre páginas (1-3s)
      await page.waitForTimeout(1000 + Math.random() * 2000);

      await botaoLocator.click()
      await page.waitForTimeout(1000)
      const before = ids.size
      await extractIds()
      const novos = ids.size - before
      log(jobId, `📄 Página ${pageNum}: +${novos} IDs (total: ${ids.size}, cache: ${listagemInfoCache.size} entradas)`)

      // Modo teste: parar ao atingir 150 IDs
      const testMode = (globalThis as any).SCRAPING_TESTE_MODE === true
      if (testMode && ids.size >= 150) {
        log(jobId, `🧪 TESTE: Limite de 150 IDs atingido, parando paginação`)
        continuar = false
      } else if (novos === 0) {
        emptyConsecutivos++
        if (emptyConsecutivos >= MAX_VAZIAS) {
          log(jobId, `📄 ${MAX_VAZIAS} páginas consecutivas sem IDs novos — encerrando`)
          continuar = false
        }
      } else {
        emptyConsecutivos = 0
      }
    } catch (err) {
      log(jobId, `⚠️ Erro ao processar página ${pageNum}: ${err}`);
      continuar = false
    }
  }

  // Modo teste: limitar a 150 IDs
  const testMode = (globalThis as any).SCRAPING_TESTE_MODE === true
  let idsFinais = [...ids]

  if (testMode && idsFinais.length > 150) {
    console.log(`[TESTE] Limitando de ${idsFinais.length} para 150 IDs`)
    idsFinais = idsFinais.slice(0, 150)
  }

  log(jobId, `✅ Total IDs coletados: ${idsFinais.length}`)
  if (idsFinais.length <= 50) {
    log(jobId, `🔍 Todos os IDs: ${idsFinais.sort((a, b) => a - b).join(', ')}`)
  } else {
    log(jobId, `🔍 IDs (primeiros 30): ${idsFinais.sort((a, b) => a - b).slice(0, 30).join(', ')}`)
  }
  return idsFinais
}

// ── Ficha scraping ────────────────────────────────────────────

async function scrapeApenadoFicha(
  page: Page,
  sipeId: number,
  unidadeNome?: string | null,
  useSearch = false
): Promise<void> {
  if (isPythonSdkEngine()) {
    try {
      await scrapeApenadoFichaFast(sipeId, unidadeNome, useSearch)
      return
    } catch (err) {
      console.warn(`[SCRAPER FAST] ⚠️ Falha na aceleração Cheerio para o apenado #${sipeId}: ${err}. Ativando fallback via Playwright tradicional.`)
    }
  }

  // Troca dinâmica de unidade ativa no Playwright se fornecida e diferente da atual
  if (unidadeNome) {
    if (unidadeNome.includes(' — ')) {
      unidadeNome = unidadeNome.split(' — ')[1];
    }
    const unidadeId = await resolveUnidadeIdByNome(unidadeNome)
    if (unidadeId) {
      await switchPlaywrightUnit(page, unidadeId, 'FICHA')
    }
  }

  if (useSearch) {
    // ── Busca cross-unit: contorna restrição de unidade da sessão ──
    const searchPath = `/apenados/index?escolha=nomeapenado&parametro=${sipeId}`
    const proxyData = await fetchSipeViaProxy(searchPath)
    
    if (proxyData && !proxyData.is_binary && proxyData.html) {
      await page.setContent(proxyData.html)
    } else {
      await gotoSipeWithFallback(page, searchPath, { waitUntil: 'domcontentloaded', timeout: 45_000 })
    }

    if (!proxyData) {
      // Verificar sessão expirada
      const searchUrl = page.url()
      if (
        searchUrl.includes('/login') ||
        searchUrl.includes('/selectRole') ||
        searchUrl === `${SIPE_URL}/` ||
        searchUrl === `${SIPE_URL}`
      ) {
        throw new Error('SESSAO_EXPIRADA')
      }
    }

    // Localizar link do apenado na tabela de resultados
    const link = await page.evaluate((id) => {
      // 1. Procura linha da tabela que contenha o sipeId exato
      const rows = Array.from(document.querySelectorAll('table tbody tr'))
      for (const row of rows) {
        const text = row.textContent ?? ''
        if (text.includes(String(id))) {
          const a = row.querySelector('a[href]') as HTMLAnchorElement | null
          if (a?.href) return a.href
        }
      }
      // 2. Fallback: qualquer link na página que contenha o sipeId na URL
      const anchors = Array.from(document.querySelectorAll('a[href]')) as HTMLAnchorElement[]
      for (const a of anchors) {
        if (a.href.includes(`/apenados/${id}`)) return a.href
      }
      return null
    }, sipeId)

    if (!link) {
      throw new Error('APENADO_NAO_ENCONTRADO')
    }

    // Navegar para o link encontrado (chega na /editar via fluxo legítimo de busca)
    const cleanLinkPath = link.replace(SIPE_URL, '')
    const editProxyData = await fetchSipeViaProxy(cleanLinkPath)
    let editStatus: number | undefined
    
    if (editProxyData && !editProxyData.is_binary && editProxyData.html) {
      await page.setContent(editProxyData.html)
      editStatus = 200
    } else {
      await ensureFallbackLogin(page)
      const editResponse = await page.goto(link, { waitUntil: 'domcontentloaded', timeout: 45_000 })
      editStatus = editResponse?.status()
      
      const editUrl = page.url()
      if (editUrl.includes('/login') || editUrl.includes('/selectRole')) {
        throw new Error('SESSAO_EXPIRADA')
      }
    }

    if (editStatus && (editStatus === 404 || editStatus === 403 || editStatus === 500)) {
      throw new Error('APENADO_NAO_ENCONTRADO')
    }
  } else {
    // ── Fluxo original: acesso direto por URL ──
    if (globalThis.__sipeCurrentEngine === 'python-sdk') {
      // 🔐 No SIPE (Laravel), é mandatório selecionar o apenado ativo na sessão
      // antes de ir para a URL /editar. Caso contrário, ocorre redirect para listagem.
      await fetchSipeViaProxy(`/apenados/${sipeId}/selecionarOpcao`).catch(() => {})
    }
    const editPath = `/apenados/${sipeId}/editar`
    const proxyData = await fetchSipeViaProxy(editPath)
    let status: number | undefined
    
    if (proxyData && !proxyData.is_binary && proxyData.html) {
      await page.setContent(proxyData.html)
      status = 200
    } else {
      // 🔐 No SIPE (Laravel), no fallback Playwright também precisamos selecionar o apenado ativo na sessão antes do editar
      await gotoSipeWithFallback(page, `/apenados/${sipeId}/selecionarOpcao`, {
        waitUntil: 'domcontentloaded',
        timeout: 25_000,
      }).catch(() => {})

      const response = await gotoSipeWithFallback(page, editPath, {
        waitUntil: 'domcontentloaded',
        timeout: 45_000,
      })
      status = response?.status()
      
      // Detect session expiration / redirect to login page
      const currentUrl = page.url()
      if (
        currentUrl.includes('/login') ||
        currentUrl === `${SIPE_URL}/` ||
        currentUrl === `${SIPE_URL}` ||
        currentUrl.includes('/selectRole')
      ) {
        throw new Error('SESSAO_EXPIRADA')
      }
    }

    // Detect HTTP errors
    if (status && (status === 404 || status === 403 || status === 500)) {
      throw new Error('APENADO_NAO_ENCONTRADO')
    }

    // Fast check for not found errors in body text (only if not loaded via proxy)
    if (!proxyData) {
      const bodyText = await page.innerText('body').catch(() => '')
      if (
        bodyText.includes('não encontrado') ||
        bodyText.includes('Não foi possível encontrar') ||
        bodyText.includes('Registro não encontrado') ||
        bodyText.includes('404')
      ) {
        throw new Error('APENADO_NAO_ENCONTRADO')
      }
    }
  }


  // Se fomos redirecionados silenciosamente de volta para o index, significa falha de permissão de unidade
  const finalUrl = page.url()
  if (finalUrl.includes('/apenados/index') || finalUrl.endsWith('/apenados') || finalUrl.endsWith('/apenados/')) {
    throw new Error('APENADO_NAO_ENCONTRADO_OU_REDIRECIONADO')
  }

  await page.waitForSelector('[name="nomeapenado"]', { timeout: 30_000 })

  const dados = await page.evaluate(() => {
    const val = (name: string) =>
      (
        document.querySelector(`[name="${name}"]`) as HTMLInputElement | null
      )?.value?.trim() || null

    const selVal = (name: string) => {
      const el = document.querySelector(
        `[name="${name}"]`
      ) as HTMLSelectElement | null
      return el?.options[el.selectedIndex]?.text?.trim() || null
    }

    // Clona o conteúdo útil ou remove elementos de layout para não ler a unidade ativa da sessão no cabeçalho do SIPE
    const contentEl = document.querySelector('.content-wrapper') || document.querySelector('#content') || document.querySelector('.content') || document.querySelector('main') || document.body
    const tempDiv = document.createElement('div')
    tempDiv.innerHTML = contentEl.innerHTML
    const unwanted = tempDiv.querySelectorAll('header, nav, .main-header, .navbar, .main-sidebar, aside, .sidebar, .user-panel, .dropdown-menu, #navbar, .header')
    unwanted.forEach(el => el.remove())
    const bodyText = tempDiv.innerText || tempDiv.textContent || ''

    let celaFicha = null
    const celaMatch = bodyText.match(/Cela:\s*([^\n]+)/i) || bodyText.match(/Cela\s*-\s*([^\n]+)/i)
    if (celaMatch) {
      celaFicha = celaMatch[1].trim()
    }

    let unidadeFicha = selVal('unidade_id') || selVal('fk_unidade') || selVal('estabelecimento') || selVal('unidade') || selVal('estabelecimento_id')
    if (!unidadeFicha) {
      const unidadeMatch = bodyText.match(/Unidade:\s*([^\n]+)/i) || bodyText.match(/Estabelecimento:\s*([^\n]+)/i) || bodyText.match(/Unidade\s*Prisional:\s*([^\n]+)/i)
      if (unidadeMatch) {
        unidadeFicha = unidadeMatch[1].trim()
      }
    }

    // Extração via regex para campos que vêm como texto (não selects)
    // Versão melhorada com múltiplos padrões
    const extractLabel = (label: string): string | null => {
      // Padrão 1: "Label : Valor" ou "Label Valor" (mesmo na linha)
      let match = bodyText.match(new RegExp(`${label}\\s*:?\\s*([^\\n]+)`, 'i'))
      if (match) {
        const value = match[1].trim()
        // Remove valores vazios ou inúteis
        if (value && value.length > 0 && !value.match(/^[\s•\-–—]+$/)) {
          return value
        }
      }

      // Padrão 2: "Label" em uma linha, valor na próxima
      match = bodyText.match(new RegExp(`${label}\\s*[\\n\\r]+\\s*([^\\n]+)`, 'i'))
      if (match) {
        const value = match[1].trim()
        if (value && value.length > 0 && !value.match(/^[\s•\-–—]+$/)) {
          return value
        }
      }

      return null
    }

    const sexoValue = selVal('sexo') || extractLabel('Sexo') || extractLabel('Sexo:') || extractLabel('Gênero')
    const etniaValue = selVal('fk_etnia') || extractLabel('Etnia')
    const estadoCivilValue = selVal('fk_estadocivil') || extractLabel('Estado Civil')
    const grauInstrucaoValue = selVal('fk_grauinstrucao') || extractLabel('Grau de Instrução') || extractLabel('Grau Instrução') || extractLabel('Instrução')
    const religiaoValue = selVal('fk_religiao') || extractLabel('Religião')
    const situacaoValue = selVal('situacao') || extractLabel('Situação') || extractLabel('Situação:') || extractLabel('Status')

    return {
      nome: val('nomeapenado'),
      nomeOutro: val('nomefalso'),
      cpf: val('cpf'),
      rg: val('rg'),
      rgOrgao: val('orgaoexpedidor'),
      dataNascimento: val('datanascimento'),
      naturalidade: val('distrito'),
      sexo: sexoValue,
      etnia: etniaValue,
      orientacaoSexual: selVal('homosexual') || extractLabel('Orientação\\s+Sexual'),
      tipoSanguineo: selVal('tiposanguineo') || extractLabel('Tipo\\s+(?:de\\s+)?Sanguíneo'),
      grauInstrucao: grauInstrucaoValue,
      religiao: religiaoValue,
      estadoCivil: estadoCivilValue,
      nomeConjuge: val('nomeesposa'),
      qtdFilhos: parseInt(val('qtdfilhos') || '0') || null,
      nomeMae: val('nomemae'),
      nomePai: val('nomepai'),
      telefone: val('telefone'),
      rji: val('rji'),
      regime: val('regime'),
      situacao: situacaoValue,
      dataEntrada: val('dataentrada'),
      dataPrisao: val('dataprisao'),
      tempoPena: val('tempodepena'),
      oficioEntrada: val('oficioentrada'),
      presoOriundo: selVal('presooriundo'),
      monitorado: val('monitorado') === 'SIM',
      intramuro: val('intramuro') === 'SIM',
      faccaoSipeId:
        parseInt(
          (document.querySelector('[name="faccao_id"]') as HTMLInputElement)
            ?.value || '0'
        ) || null,
      celaFicha,
      unidadeFicha,
    }
  })

  // Resolve faccao local id
  let faccaoId: string | null = null
  let lookupSipeId = dados.faccaoSipeId
  if (lookupSipeId && lookupSipeId > 0) {
    const faccao = await prisma.sipeFaccao.findUnique({
      where: { sipeId: lookupSipeId },
    })
    faccaoId = faccao?.id ?? null
  }

  // --- Extração de Imagem ---
  let photoPath: string | null = null;
  let fotoAtualizada = false;
  let complementaryPhotoSrcs: string[] = [];
  try {
    const imagesInfo = await page.evaluate(() => {
      const imgs = Array.from(document.querySelectorAll('img'));
      let mainSrc: string | null = null;
      const allSrcs: string[] = [];

      for (const img of imgs) {
        const src = img.src || '';
        const alt = (img.alt || '').toLowerCase();
        const id = (img.id || '').toLowerCase();
        const className = (img.className || '').toLowerCase();
        
        if (
          !mainSrc && (
            id.includes('foto') || id.includes('profile') || id.includes('avatar') || id.includes('apenado') ||
            className.includes('foto') || className.includes('profile') || className.includes('avatar') || className.includes('apenado') ||
            alt.includes('foto') || alt.includes('profile') || alt.includes('avatar') || alt.includes('apenado') ||
            src.includes('/foto') || src.includes('/photo') || src.includes('/imagem') || src.includes('/getFoto') || src.includes('/arquivo')
          )
        ) {
          mainSrc = src;
        } else {
          allSrcs.push(src);
        }
      }
      
      const containerImg = document.querySelector('.foto, .foto-apenado, .profile-image, #foto img') as HTMLImageElement;
      if (containerImg) mainSrc = containerImg.src;

      if (!mainSrc && imgs.length > 0) {
        const candidates = imgs.filter(img => {
          const src = (img.src || '').toLowerCase();
          return !src.includes('logo') && !src.includes('sejus') && !src.includes('governo') && !src.includes('brasao') && !src.includes('bandeira') && !src.includes('icon');
        });
        if (candidates.length > 0) {
          mainSrc = candidates[0].src;
        }
      }
      
      return { mainSrc, allSrcs };
    });

    const photoSrc = imagesInfo.mainSrc;
    complementaryPhotoSrcs = imagesInfo.allSrcs.filter(src => {
      const s = src.toLowerCase();
      return src && s !== photoSrc &&
        !s.includes('logo') && !s.includes('sejus') && !s.includes('governo') &&
        !s.includes('brasao') && !s.includes('bandeira') && !s.includes('icon') &&
        !s.includes('chosen') && !s.includes('select');
    });

    if (photoSrc) {
      // Remove o sufixo _fotoUsuario da URL para baixar a imagem original sem o filtro/marca d'água do SIPE
      const cleanPhotoSrc = photoSrc.replace(/_fotoUsuario/i, '');

      let base64Data: string | null = null;
      if (cleanPhotoSrc.startsWith('data:image/')) {
        base64Data = cleanPhotoSrc;
      } else {
        // Tenta baixar a foto via proxy Python
        const photoPathRelative = cleanPhotoSrc.replace(SIPE_URL, '');
        const proxyPhoto = await fetchSipeViaProxy(photoPathRelative);
        if (proxyPhoto && proxyPhoto.is_binary && proxyPhoto.data) {
          base64Data = proxyPhoto.data;
        } else {
          const absoluteUrl = new URL(cleanPhotoSrc, page.url()).href;
          base64Data = await page.evaluate(async (url) => {
            try {
              const res = await fetch(url);
              if (!res.ok) return null;
              const blob = await res.blob();
              return new Promise<string>((resolve) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result as string);
                reader.readAsDataURL(blob);
              });
            } catch {
              return null;
            }
          }, absoluteUrl);
        }

        // Fallback: se falhou ao obter a foto original limpa (ex: 404), tenta obter a foto original (com proteção/marca d'água)
        if (!base64Data && cleanPhotoSrc !== photoSrc) {
          const fallbackPathRelative = photoSrc.replace(SIPE_URL, '');
          const fallbackProxyPhoto = await fetchSipeViaProxy(fallbackPathRelative);
          if (fallbackProxyPhoto && fallbackProxyPhoto.is_binary && fallbackProxyPhoto.data) {
            base64Data = fallbackProxyPhoto.data;
          } else {
            const absoluteUrlFallback = new URL(photoSrc, page.url()).href;
            base64Data = await page.evaluate(async (url) => {
              try {
                const res = await fetch(url);
                if (!res.ok) return null;
                const blob = await res.blob();
                return new Promise<string>((resolve) => {
                  const reader = new FileReader();
                  reader.onloadend = () => resolve(reader.result as string);
                  reader.readAsDataURL(blob);
                });
              } catch {
                return null;
              }
            }, absoluteUrlFallback);
          }
        }
      }


      if (base64Data && base64Data.includes(',')) {
        const base64Content = base64Data.split(',')[1];
        const imageBuffer = Buffer.from(base64Content, 'base64');

        const webpBuffer = await sharp(imageBuffer)
          .resize(800, 800, { fit: 'inside', withoutEnlargement: true })
          .webp({ quality: 90 })
          .toBuffer();

        const dir = getApenadosDir();
        const { mkdir, writeFile, readFile } = await import('fs/promises');
        const { createHash } = await import('crypto');
        await mkdir(dir, { recursive: true });
        const filename = `sipe-${sipeId}.webp`;
        const localPath = join(dir, filename);

        let shouldWrite = true;
        if (existsSync(localPath)) {
          try {
            const existingBuffer = await readFile(localPath);
            const currentHash = createHash('sha256').update(webpBuffer).digest('hex');
            const existingHash = createHash('sha256').update(existingBuffer).digest('hex');
            if (currentHash === existingHash) {
              shouldWrite = false;
            }
          } catch {
            // Em caso de erro ao ler o arquivo existente, prossegue sobrescrevendo
          }
        }

        if (shouldWrite) {
          await writeFile(localPath, webpBuffer);
          fotoAtualizada = true;
        }

        photoPath = `uploads/apenados/${filename}`;
      }
    }
  } catch (err) {
    // Falha silenciosa de foto
  }

  // Busca o apenado existente no banco local para preservar dados da listagem (como situação e cela) caso o cache esteja vazio
  const existingApenado = await prisma.sipeApenadoImportado.findUnique({
    where: { sipeId },
    select: { situacao: true, cela: true, unidade: true }
  });

  // Recupera cela e situação do cache obtido na listagem (prioridade) ou tenta ler do corpo do perfil
  const cela = listagemInfoCache.get(sipeId)?.cela ?? existingApenado?.cela ?? dados.celaFicha ?? null;
  const situacao = listagemInfoCache.get(sipeId)?.situacao ?? existingApenado?.situacao ?? dados.situacao ?? null;
  const unidade = unidadeNome ?? existingApenado?.unidade ?? dados.unidadeFicha ?? null;

  // --- Integração com Identificação de Apenados (tabela Apenado local) ---
  const nomeApenadoUpper = (dados.nome || 'SEM NOME').trim().toUpperCase();
  let faccaoNome: string | null = null;
  if (faccaoId) {
    const faccaoObj = await prisma.sipeFaccao.findUnique({ where: { id: faccaoId } });
    faccaoNome = faccaoObj?.nome ?? null;
  }

  // 🔐 Estratégia de busca: matricula (CPF/RJI) é ÚNICO e seguro
  // Primeiro tenta por matricula, depois por nome (compatibilidade com dados antigos)
  const matriculaIdentifier = dados.rji || dados.cpf || null;
  let localApenado = null;

  if (matriculaIdentifier) {
    localApenado = await prisma.apenado.findFirst({
      where: { matricula: matriculaIdentifier }
    });
  }

  let nomeFinalApenado = nomeApenadoUpper;

  // Fallback: busca por nome se não encontrou por matricula (compatibilidade)
  if (!localApenado) {
    const apenadoExistenteMesmoNome = await prisma.apenado.findFirst({
      where: { name: nomeApenadoUpper }
    });

    if (apenadoExistenteMesmoNome) {
      // Já existe um apenado com esse nome. Para evitar sobrepor a foto e misturar registros,
      // usaremos o sufixo " SIPE" no nome do novo registro de apenado que receberá a foto.
      nomeFinalApenado = `${nomeApenadoUpper} SIPE`;
      
      // Agora, tentamos ver se já criamos esse apenado com sufixo " SIPE" em uma sincronização anterior
      localApenado = await prisma.apenado.findFirst({
        where: { name: nomeFinalApenado }
      });
    }
  }

  if (!localApenado) {
    localApenado = await prisma.apenado.create({
      data: {
        name: nomeFinalApenado,
        matricula: dados.rji || dados.cpf || null,
        unidade: unidade || null,
        faccao: faccaoNome || null,
        photoPath: photoPath || null,
      }
    });
  } else {
    const updateData: any = {};
    // Só atualiza a foto local se for detectada alteração (fotoAtualizada === true)
    // ou se o apenado local atualmente estiver sem foto cadastrada.
    if (photoPath && (fotoAtualizada || !localApenado.photoPath)) {
      updateData.photoPath = photoPath;
      
      // Reseta hashes para forçar re-indexação facial no job em background apenas se a foto mudou
      if (fotoAtualizada) {
        updateData.photoHash = null;
        updateData.photoQuality = null;
        updateData.photoHashSha = null;
        updateData.faceDescriptor = null;
        updateData.detScore = null;
      }
    }
    
    // 🔐 Garante que matricula está sempre definida (importante para deduplicação)
    // Só atualiza se ainda não tem matricula ou se a nova é diferente
    if ((dados.rji || dados.cpf) && !localApenado.matricula) {
      updateData.matricula = dados.rji || dados.cpf;
    }

    if (unidade && localApenado.unidade !== unidade) {
      updateData.unidade = unidade;
    }
    if (!localApenado.faccao && faccaoNome) {
      updateData.faccao = faccaoNome;
    }

    if (Object.keys(updateData).length > 0) {
      localApenado = await prisma.apenado.update({
        where: { id: localApenado.id },
        data: updateData
      });
    }
  }

  // FIX: Para GLOBAL scraping, usar unidade extraída do formulário como fallback
  // Se não encontrar "Unidade:", tenta usar "cela" (que contém o nome da unidade prisional)
  const resolvedUnidade = unidade || dados.unidadeFicha || cela || undefined

  // DEBUG: Log para verificar qual fallback foi usado
  if (!unidade) {
    if (dados.unidadeFicha) {
      console.log(`[SCRAPER] ✅ GLOBAL fallback (unidadeFicha) - Apenado #${sipeId}: => "${resolvedUnidade}"`)
    } else if (cela) {
      console.log(`[SCRAPER] ✅ GLOBAL fallback (cela) - Apenado #${sipeId}: => "${resolvedUnidade}"`)
    } else {
      console.log(`[SCRAPER] ⚠️ GLOBAL sem fallback - Apenado #${sipeId}: nenhuma unidade encontrada`)
    }
  }

  const upsertData = {
    nome: dados.nome || 'SEM NOME',
    nomeOutro: dados.nomeOutro,
    cpf: dados.cpf,
    rg: dados.rg,
    rgOrgao: dados.rgOrgao,
    dataNascimento: dados.dataNascimento,
    naturalidade: dados.naturalidade,
    sexo: dados.sexo,
    etnia: dados.etnia,
    orientacaoSexual: dados.orientacaoSexual,
    tipoSanguineo: dados.tipoSanguineo,
    grauInstrucao: dados.grauInstrucao,
    religiao: dados.religiao,
    estadoCivil: dados.estadoCivil,
    nomeConjuge: dados.nomeConjuge,
    qtdFilhos: dados.qtdFilhos,
    nomeMae: dados.nomeMae,
    nomePai: dados.nomePai,
    telefone: dados.telefone,
    rji: dados.rji,
    regime: dados.regime,
    situacao: situacao || undefined,
    dataEntrada: dados.dataEntrada,
    dataPrisao: dados.dataPrisao,
    tempoPena: dados.tempoPena,
    monitorado: dados.monitorado,
    intramuro: dados.intramuro,
    presoOriundo: dados.presoOriundo,
    oficioEntrada: dados.oficioEntrada,
    faccaoId,
    photoPath,
    unidade: resolvedUnidade,
    cela: cela || undefined,
    ultimaSyncAt: new Date(),
  }

  const apenado = await prisma.sipeApenadoImportado.upsert({
    where: { sipeId },
    create: { sipeId, ...upsertData },
    update: upsertData,
    include: { faccao: true }
  })

  // ============ SINCRONIZAÇÃO COM AIP ============
  // Se existe registro em AIP para este apenado, atualizar campos SIPE
  // Se não existe, CRIAR um novo registro
  // Campos de inteligência NÃO são sobrescritos
  try {
    const aipSyncData = {
      // ============ DADOS PESSOAIS ============
      nome: apenado.nome,
      nomeOutro: apenado.nomeOutro,
      cpf: apenado.cpf,
      rg: apenado.rg,
      rgOrgao: apenado.rgOrgao,
      dataNascimento: apenado.dataNascimento,
      sexo: apenado.sexo,
      etnia: apenado.etnia,
      naturalidade: apenado.naturalidade,
      orientacaoSexual: apenado.orientacaoSexual,
      tipoSanguineo: apenado.tipoSanguineo,
      grauInstrucao: apenado.grauInstrucao,
      religiao: apenado.religiao,
      estadoCivil: apenado.estadoCivil,
      nomeConjuge: apenado.nomeConjuge,
      qtdFilhos: apenado.qtdFilhos,
      nomeMae: apenado.nomeMae,
      nomePai: apenado.nomePai,
      telefone: apenado.telefone,
      rji: apenado.rji,

      // ============ DADOS PRISIONAIS ============
      unidade: apenado.unidade,
      cela: apenado.cela,
      regime: apenado.regime,
      situacao: apenado.situacao,
      dataEntrada: apenado.dataEntrada,
      dataPrisao: apenado.dataPrisao,
      tempoPena: apenado.tempoPena,
      faccao: apenado.faccao?.nome || null,
      monitorado: apenado.monitorado,
      intramuro: apenado.intramuro,
      presoOriundo: apenado.presoOriundo,
      oficioEntrada: apenado.oficioEntrada,
      celeAtual: apenado.celeAtual,
      ultimaMovimentacao: apenado.ultimaMovimentacao,

      // ============ ENDEREÇO RESIDENCIAL ============
      logradouro: apenado.logradouro,
      numero: apenado.numero,
      complemento: apenado.complemento,
      bairro: apenado.bairro,
      cidade: apenado.cidade,
      uf: apenado.uf,
      cep: apenado.cep,

      // ============ FOTOS ============
      photoPath: apenado.photoPath,

      // ============ METADATA ============
      ultimaSincAt: new Date(),
    }

    const apenadoEmAIP = await prisma.aIPApenado.findUnique({
      where: { sipeId }
    })

    if (apenadoEmAIP) {
      // Atualizar apenas se já foi cadastrado manualmente em AIP
      // Nunca cria novos registros automaticamente - apenas o usuário via "Cadastrar em AIP" pode fazer isso
      await prisma.aIPApenado.update({
        where: { id: apenadoEmAIP.id },
        data: aipSyncData
      }).catch((err) => {
        console.error(`[AIP] Erro ao sincronizar ${sipeId}:`, err.message)
      })
      console.log(`[AIP] ✅ Apenado #${sipeId} atualizado em AIP (unidade="${aipSyncData.unidade}")`)
    }
    // REMOVIDO: Criação automática de registros em AIP durante scraping
    // Apenas usuários podem cadastrar apenados em AIP manualmente via botão "Cadastrar em AIP"
  } catch (err) {
    console.error(`[AIP] Erro na sincronização AIP:`, err)
  }

  // Salva as fotos complementares encontradas na ficha de edição
  for (const src of complementaryPhotoSrcs) {
    await saveAndLinkComplementaryPhoto(page, src, apenado.id, localApenado.id, 'Foto de Identificação');
  }

  // Executa o scraping de dados complementares de forma sequencial para evitar colisões de navegação na mesma aba (page) do Playwright
  await scrapeProcessos(page, sipeId, apenado.id).catch(() => {});
  await scrapeAlcunhas(page, sipeId, apenado.id).catch(() => {});
  await scrapeEndereço(page, sipeId, apenado.id).catch(() => {});
  await scrapeHistorico(page, sipeId, apenado.id).catch(() => {});
  await scrapeDocumentos(page, sipeId, apenado.id).catch(() => {});
  await scrapeFotosComplementares(page, sipeId, apenado.id, localApenado.id).catch(() => {});
  await scrapeVisitantes(page, sipeId, apenado.id).catch(() => {});
  await scrapeAdvogadosDoApenado(page, sipeId, apenado.id).catch(() => {});

  if (globalThis.__sipeState && (globalThis.__sipeState.tipo === 'UNIDADES' || globalThis.__sipeState.tipo === 'UNIDADES_FAST')) {
    await saveApenadoUnidadePrisional(sipeId, apenado.id)
  }
}

async function saveAndLinkComplementaryPhoto(
  page: Page,
  src: string,
  apenadoId: string,
  apenadoLocalId: string | null,
  descricao: string
): Promise<void> {
  try {
    const cleanSrc = src.replace(/_fotoUsuario/i, '');
    const absoluteUrl = new URL(cleanSrc, page.url()).href;
    
    const { createHash } = await import('crypto');
    const urlHash = createHash('md5').update(absoluteUrl).digest('hex');
    const filename = `sipe-comp-${urlHash}.webp`;
    
    const dir = getApenadosDir();
    const { mkdir, writeFile } = await import('fs/promises');
    await mkdir(dir, { recursive: true });
    const localPath = join(dir, filename);
    const photoPath = `uploads/apenados/${filename}`;

    const existing = await prisma.sipeFotoComplementar.findUnique({
      where: { photoPath }
    });
    if (existing) {
      if (apenadoLocalId && !existing.apenadoLocalId) {
        await prisma.sipeFotoComplementar.update({
          where: { id: existing.id },
          data: { apenadoLocalId }
        });
      }
      return;
    }

    let base64Data: string | null = null;
    const cleanPath = cleanSrc.replace(SIPE_URL, '');
    const proxyPhoto = await fetchSipeViaProxy(cleanPath);
    if (proxyPhoto && proxyPhoto.is_binary && proxyPhoto.data) {
      base64Data = proxyPhoto.data;
    } else {
      base64Data = await page.evaluate(async (url) => {
        try {
          const res = await fetch(url);
          if (!res.ok) return null;
          const blob = await res.blob();
          return new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.readAsDataURL(blob);
          });
        } catch {
          return null;
        }
      }, absoluteUrl);
    }

    // Fallback: se falhou ao obter a foto original limpa (ex: 404), tenta com a URL original (com proteção/marca d'água)
    if (!base64Data && cleanSrc !== src) {
      const fallbackPath = src.replace(SIPE_URL, '');
      const proxyFallbackPhoto = await fetchSipeViaProxy(fallbackPath);
      if (proxyFallbackPhoto && proxyFallbackPhoto.is_binary && proxyFallbackPhoto.data) {
        base64Data = proxyFallbackPhoto.data;
      } else {
        const absoluteUrlFallback = new URL(src, page.url()).href;
        base64Data = await page.evaluate(async (url) => {
          try {
            const res = await fetch(url);
            if (!res.ok) return null;
            const blob = await res.blob();
            return new Promise<string>((resolve) => {
              const reader = new FileReader();
              reader.onloadend = () => resolve(reader.result as string);
              reader.readAsDataURL(blob);
            });
          } catch {
            return null;
          }
        }, absoluteUrlFallback);
      }
    }


    if (base64Data && base64Data.includes(',')) {
      const base64Content = base64Data.split(',')[1];
      const imageBuffer = Buffer.from(base64Content, 'base64');

      const webpBuffer = await sharp(imageBuffer)
        .resize(800, 800, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 90 })
        .toBuffer();

      await writeFile(localPath, webpBuffer);

      await prisma.sipeFotoComplementar.create({
        data: {
          apenadoImportadoId: apenadoId,
          apenadoLocalId,
          photoPath,
          descricao
        }
      });
    }
  } catch (err) {
    // Falha silenciosa para não travar o fluxo principal
  }
}

async function scrapeFotosComplementares(
  page: Page,
  sipeId: number,
  apenadoId: string,
  apenadoLocalId: string | null
): Promise<void> {
  const rotas = [
    `${SIPE_URL}/apenados/${sipeId}/fotos`,
    `${SIPE_URL}/apenados/${sipeId}/galeria`,
    `${SIPE_URL}/apenados/${sipeId}/foto`,
  ];
  for (const url of rotas) {
    try {
      const path = url.replace(SIPE_URL, '')
      const proxyData = await fetchSipeViaProxy(path)
      let status: number | undefined
      
      if (proxyData && !proxyData.is_binary && proxyData.html) {
        await page.setContent(proxyData.html)
        status = 200
      } else {
        await ensureFallbackLogin(page)
        const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 8000 });
        status = response?.status();
      }
      
      if (status && (status === 404 || status === 403 || status === 500)) {
        continue;
      }

      
      const currentUrl = page.url();
      if (
        currentUrl.includes('/login') ||
        currentUrl === `${SIPE_URL}/` ||
        currentUrl === `${SIPE_URL}` ||
        currentUrl.includes('/selectRole')
      ) {
        continue;
      }

      const bodyText = await page.innerText('body').catch(() => '');
      if (bodyText.includes('404') || bodyText.includes('não encontrado') || bodyText.includes('Não autorizado')) {
        continue;
      }

      const imgUrls = await page.evaluate(() => {
        const imgs = Array.from(document.querySelectorAll('img'));
        return imgs
          .map(img => img.src || '')
          .filter(src => {
            const s = src.toLowerCase();
            return src &&
              !s.includes('logo') && !s.includes('sejus') && !s.includes('governo') &&
              !s.includes('brasao') && !s.includes('bandeira') && !s.includes('icon');
          });
      });

      for (const imgUrl of imgUrls) {
        await saveAndLinkComplementaryPhoto(page, imgUrl, apenadoId, apenadoLocalId, 'Foto da Galeria');
      }
    } catch {
      // ignora erro e passa para a próxima URL
    }
  }
}

async function scrapeProcessos(
  page: Page,
  sipeId: number,
  apenadoId: string
): Promise<void> {
  try {
    const path = `/apenados/${sipeId}/incluirProcessos`

    const proxyData = await fetchSipeViaProxy(path)
    if (proxyData && !proxyData.is_binary && proxyData.html) {
      await page.setContent(proxyData.html)
    } else {
      await gotoSipeWithFallback(page, path, { waitUntil: 'domcontentloaded' })
    }
    await page.waitForSelector('body', { timeout: 10_000 })

    // Tenta extrair de forma estruturada via DOM (Tabelas)
    const processosEstruturados = await page.evaluate(() => {
      const tabelas = Array.from(document.querySelectorAll('table'))
      const resultados: Array<{
        sipeProcessoId: number | null
        numero: string | null
        vara: string | null
        artigos: string[]
        tempoPena: string | null
        principal: boolean
      }> = []

      for (const tabela of tabelas) {
        const rows = Array.from(tabela.querySelectorAll('tbody tr'))
        if (rows.length === 0) continue

        // Identifica os índices das colunas pelos cabeçalhos
        const headers = Array.from(tabela.querySelectorAll('thead th, thead td')).map(h => (h.textContent ?? '').toUpperCase().trim())
        
        const numIdx = headers.findIndex(h => h.includes('NÚMERO') || h.includes('PROCESSO') || h.includes('NUMERO'))
        const varaIdx = headers.findIndex(h => h.includes('VARA') || h.includes('JUÍZO') || h.includes('JUIZO'))
        const artIdx = headers.findIndex(h => h.includes('ARTIGO') || h.includes('INFRAÇÃO') || h.includes('INFRACAO') || h.includes('CAPITULAÇÃO') || h.includes('CAPITULACAO'))
        const penaIdx = headers.findIndex(h => h.includes('PENA') || h.includes('TEMPO'))
        const princIdx = headers.findIndex(h => h.includes('PRINCIPAL'))

        for (const row of rows) {
          const cells = Array.from(row.querySelectorAll('td'))
          if (cells.length < 2) continue

          // Extrai o ID do processo do SIPE, geralmente presente em links ou botões na linha
          let sipeProcessoId: number | null = null
          const links = Array.from(row.querySelectorAll('a, button'))
          for (const link of links) {
            const href = link.getAttribute('href') || ''
            const onClickText = link.getAttribute('onclick') || ''
            const actionText = href + ' ' + onClickText
            const match = actionText.match(/\/processos\/(\d+)/) || actionText.match(/processo_id[^\d]*(\d+)/) || actionText.match(/\/excluirProcesso\/(\d+)/) || actionText.match(/\/excluir\/(\d+)/)
            if (match) {
              sipeProcessoId = parseInt(match[1])
              break
            }
          }

          let numero: string | null = null
          if (numIdx >= 0 && cells[numIdx]) {
            numero = cells[numIdx].textContent?.trim() || null
          } else {
            numero = cells[0].textContent?.trim() || null
          }

          if (numero) {
            numero = numero.replace(/\s+/g, ' ').trim()
          }

          let vara: string | null = null
          if (varaIdx >= 0 && cells[varaIdx]) {
            vara = cells[varaIdx].textContent?.trim() || null
          }

          let artigos: string[] = []
          if (artIdx >= 0 && cells[artIdx]) {
            const rawArt = cells[artIdx].textContent?.trim() || ''
            artigos = rawArt.split(/[,;\n]/).map(a => a.trim()).filter(Boolean)
          }

          let tempoPena: string | null = null
          if (penaIdx >= 0 && cells[penaIdx]) {
            tempoPena = cells[penaIdx].textContent?.trim() || null
          }

          let principal = false
          if (princIdx >= 0 && cells[princIdx]) {
            const checkbox = cells[princIdx].querySelector('input[type="checkbox"], input[type="radio"]') as HTMLInputElement | null
            if (checkbox) {
              principal = checkbox.checked
            } else {
              const text = (cells[princIdx].textContent ?? '').toUpperCase()
              principal = text.includes('SIM') || text.includes('PRINCIPAL') || text.includes('ATIVO')
            }
          }

          resultados.push({
            sipeProcessoId,
            numero,
            vara,
            artigos,
            tempoPena,
            principal
          })
        }
      }
      return resultados
    })

    if (processosEstruturados && processosEstruturados.length > 0) {
      for (const p of processosEstruturados) {
        // Se não conseguiu extrair o sipeProcessoId, gera um id determinístico baseado no número
        const procId = p.sipeProcessoId ?? Math.abs(hashCode(p.numero || ''))
        
        await prisma.sipeProcesso.upsert({
          where: { id: `${apenadoId}_${procId}` },
          create: {
            id: `${apenadoId}_${procId}`,
            apenadoId,
            sipeProcessoId: p.sipeProcessoId,
            numero: p.numero,
            vara: p.vara,
            artigos: p.artigos,
            tempoPena: p.tempoPena,
            principal: p.principal
          },
          update: {
            numero: p.numero,
            vara: p.vara,
            artigos: p.artigos,
            tempoPena: p.tempoPena,
            principal: p.principal
          }
        })
      }
      return
    }

    // Helper hashCode
    function hashCode(str: string) {
      let hash = 0
      for (let i = 0; i < str.length; i++) {
        hash = (hash << 5) - hash + str.charCodeAt(i)
        hash |= 0 // Convert to 32bit integer
      }
      return hash
    }

    // Fallback: regex se falhar a tabela
    const text = await page.innerText('body')
    const processoRegex = /(\d+) - NÚMERO PROCESSO: ([^\n/]*)/g
    let m
    while ((m = processoRegex.exec(text)) !== null) {
      const sipeProcessoId = parseInt(m[1])
      const numero = m[2].trim()
      const artigos: string[] = []
      const artigoRegex = /Art\s*\d+[^\n]*/g
      let am
      while ((am = artigoRegex.exec(text)) !== null) {
        artigos.push(am[0].trim())
      }
      await prisma.sipeProcesso.upsert({
        where: { id: `${apenadoId}_${sipeProcessoId}` },
        create: { id: `${apenadoId}_${sipeProcessoId}`, apenadoId, sipeProcessoId, numero, artigos },
        update: { numero, artigos },
      })
    }
  } catch (err) {
    console.error(`Erro ao sincronizar processos do apenado ${sipeId}:`, err)
  }
}

async function scrapeVisitantes(
  page: Page,
  sipeId: number,
  apenadoId: string
): Promise<void> {
  const url = `${SIPE_URL}/autorizacoes/${sipeId}/mostrar`

  try {
    const path = `/autorizacoes/${sipeId}/mostrar`
    const proxyData = await fetchSipeViaProxy(path)
    let status: number | undefined
    
    if (proxyData && !proxyData.is_binary && proxyData.html) {
      await page.setContent(proxyData.html)
      status = 200
    } else {
      const response = await gotoSipeWithFallback(page, path, { waitUntil: 'domcontentloaded', timeout: 15_000 })
      status = response?.status()
    }
    
    if (status && (status === 404 || status === 403 || status === 500 || status === 405)) {
      return
    }


    const bodyText = await page.innerText('body').catch(() => '')
    if (bodyText.includes('404') || bodyText.includes('não encontrado') || bodyText.includes('Não autorizado') || bodyText.includes('Method Not Allowed')) {
      return
    }

    const hasTable = await page.evaluate(() => document.querySelector('table') !== null)
    if (!hasTable) return

    const visitantes = await page.evaluate(() => {
      const tabelas = Array.from(document.querySelectorAll('table'))
      const list: Array<{
        visitaId: string | null
        nome: string
        cpf: string | null
        parentesco: string | null
        photoSrc: string | null
        ativo: boolean
      }> = []

      tabelas.forEach((table, tableIdx) => {
        const rows = Array.from(table.querySelectorAll('tbody tr'))
        if (rows.length === 0) return

        const headers = Array.from(table.querySelectorAll('thead th, thead td')).map(h => (h.textContent ?? '').toUpperCase().trim())
        
        // Mapeia colunas baseado em headers
        const nomeIdx = headers.findIndex(h => h.includes('NOME') || h.includes('VISITANTE') || h.includes('CREDENCIADO'))
        const cpfIdx = headers.findIndex(h => h.includes('CPF'))
        const parenIdx = headers.findIndex(h => h.includes('PARENTESCO') || h.includes('VÍNCULO') || h.includes('VINCULO') || h.includes('GRAU'))
        
        // A primeira tabela (índice 0) é de ativos, a segunda (índice 1) é de históricos/inativos
        const isTableAtivo = tableIdx === 0

        for (const row of rows) {
          const cells = Array.from(row.querySelectorAll('td'))
          if (cells.length < 2) continue

          const img = row.querySelector('img')
          const photoSrc = img ? img.src : null

          // O id da visita/vínculo está no data-id do primeiro td ou no próprio texto dele
          let visitaId: string | null = null
          const firstCell = cells[0]
          if (firstCell) {
            visitaId = firstCell.getAttribute('data-id') || firstCell.textContent?.trim() || null
          }

          let nome = ''
          if (nomeIdx >= 0 && cells[nomeIdx]) {
            nome = (cells[nomeIdx].textContent ?? '').trim()
          } else {
            // Fallback caso não ache header
            const firstColHasImg = cells[0].querySelector('img') !== null
            nome = (cells[firstColHasImg ? 1 : 0].textContent ?? '').trim()
          }

          if (!nome || nome.toUpperCase().includes('NENHUM') || nome.toUpperCase().includes('REGISTRO') || nome.length < 3) {
            continue
          }

          let cpf: string | null = null
          if (cpfIdx >= 0 && cells[cpfIdx]) {
            cpf = (cells[cpfIdx].textContent ?? '').replace(/\D/g, '')
          } else {
            const rowText = (row as HTMLElement).innerText || row.textContent || ''
            const cpfMatch = rowText.match(/\d{3}\.\d{3}\.\d{3}-\d{2}/)
            if (cpfMatch) {
              cpf = cpfMatch[0].replace(/\D/g, '')
            }
          }

          let parentesco: string | null = null
          if (parenIdx >= 0 && cells[parenIdx]) {
            parentesco = (cells[parenIdx].textContent ?? '').trim()
          }

          list.push({
            visitaId,
            nome,
            cpf: cpf && cpf.length === 11 ? cpf : null,
            parentesco,
            photoSrc,
            ativo: isTableAtivo
          })
        }
      })
      return list
    })

    if (visitantes.length === 0) {
      return
    }

    for (const v of visitantes) {
      const normalizedCpf = normalizeCPF(v.cpf)
      v.cpf = normalizedCpf
      let photoPath: string | null = null
      let photoSrc = v.photoSrc

      // Se não tem photoSrc (o que é o padrão na listagem de autorizações do preso), 
      // tenta navegar para a página de mostra de entrada da visita para obter o CPF real e a foto
      if (!photoSrc && v.visitaId) {
        try {
          const subPage = await page.context().newPage()
          const subUrl = `${SIPE_URL}/visitas/entrada/mostra/${v.visitaId}`
          const subRes = await subPage.goto(subUrl, { waitUntil: 'domcontentloaded', timeout: 15_000 })
          
          if (subRes && subRes.status() === 200) {
            const visitorDetails = await subPage.evaluate(() => {
              const rows = Array.from(document.querySelectorAll('.profile-info-row'))
              let cpf: string | null = null
              
              const cpfRow = rows.find(r => {
                const nameText = r.querySelector('.profile-info-name')?.textContent?.trim() || ''
                return nameText.toLowerCase().includes('cpf')
              })
              
              if (cpfRow) {
                cpf = cpfRow.querySelector('.profile-info-value')?.textContent?.trim()?.replace(/\D/g, '') || null
              }
              
              const imgs = Array.from(document.querySelectorAll('img'))
              
              // 1. Tenta achar imagem na pasta public/fotosVisitas
              let pSrc: string | null = null
              const candidate = imgs.find(img => img.src && img.src.includes('/public/fotosVisitas/'))
              if (candidate) {
                pSrc = candidate.src
              } else {
                // 2. Tenta achar na pasta .profile-picture
                const profileImg = document.querySelector('.profile-picture img') as HTMLImageElement
                if (profileImg && profileImg.src && !profileImg.src.includes('loading.gif')) {
                  pSrc = profileImg.src
                } else {
                  // 3. Fallback: primeira imagem que não seja loading ou brasão
                  const fallbackImgs = imgs.filter(img => {
                    const s = (img.src || '').toLowerCase()
                    return !s.includes('loading.gif') && !s.includes('logo') && !s.includes('sejus') && !s.includes('governo') && !s.includes('brasao')
                  })
                  if (fallbackImgs.length > 0) pSrc = fallbackImgs[0].src
                }
              }
              
              return { cpf, photoSrc: pSrc }
            })

            if (visitorDetails.cpf) {
              v.cpf = visitorDetails.cpf
            }
            if (visitorDetails.photoSrc) {
              photoSrc = visitorDetails.photoSrc
            }
          }
          await subPage.close().catch(() => {})
        } catch (subErr) {
          console.error(`Erro ao obter foto/CPF do visitante ${v.nome} na subpágina ${v.visitaId}:`, subErr)
        }
      }

      if (photoSrc) {
        try {
          const cleanPhotoSrc = photoSrc.replace(/_fotoUsuario/i, '')
          const absoluteUrl = new URL(cleanPhotoSrc, page.url()).href
          let base64Data = await page.evaluate(async (url) => {
            try {
              const res = await fetch(url)
              if (!res.ok) return null
              const blob = await res.blob()
              return new Promise<string>((resolve) => {
                const reader = new FileReader()
                reader.onloadend = () => resolve(reader.result as string)
                reader.readAsDataURL(blob)
              })
            } catch {
              return null
            }
          }, absoluteUrl)

          // Fallback: se falhou ao obter a foto original limpa (ex: 404), tenta com a URL original (com proteção/marca d'água)
          if (!base64Data && cleanPhotoSrc !== photoSrc) {
            const absoluteUrlFallback = new URL(photoSrc, page.url()).href
            base64Data = await page.evaluate(async (url) => {
              try {
                const res = await fetch(url)
                if (!res.ok) return null
                const blob = await res.blob()
                return new Promise<string>((resolve) => {
                  const reader = new FileReader()
                  reader.onloadend = () => resolve(reader.result as string)
                  reader.readAsDataURL(blob)
                })
              } catch {
                return null
              }
            }, absoluteUrlFallback)
          }

          if (base64Data && base64Data.includes(',')) {
            const base64Content = base64Data.split(',')[1]
            const imageBuffer = Buffer.from(base64Content, 'base64')

            const webpBuffer = await sharp(imageBuffer)
              .resize(600, 600, { fit: 'inside', withoutEnlargement: true })
              .webp({ quality: 85 })
              .toBuffer()

            const { mkdir, writeFile } = await import('fs/promises')
            const baseDir = process.env.UPLOAD_DIR || join(process.cwd(), 'uploads')
            const visitDir = join(baseDir, 'visitantes')
            await mkdir(visitDir, { recursive: true })

            const fileKey = v.cpf || Math.abs(hashCodeLocal(v.nome))
            const filename = `visitante-${fileKey}.webp`
            const localPath = join(visitDir, filename)

            await writeFile(localPath, webpBuffer)
            photoPath = `uploads/visitantes/${filename}`
          }
        } catch (imgErr) {
          console.error(`Falha ao baixar foto do visitante ${v.nome}:`, imgErr)
        }
      }

      let vis = null
      if (v.cpf) {
        vis = await prisma.sipeVisitante.findFirst({ where: { cpf: v.cpf } })
      }
      if (!vis) {
        vis = await prisma.sipeVisitante.findFirst({ where: { nome: v.nome } })
      }

      const upsertData = {
        nome: v.nome,
        cpf: v.cpf || null,
        parentesco: v.parentesco,
        ...(photoPath ? { photoPath } : {})
      }

      if (vis) {
        vis = await prisma.sipeVisitante.update({
          where: { id: vis.id },
          data: upsertData
        })
      } else {
        vis = await prisma.sipeVisitante.create({
          data: upsertData
        })
      }

      await prisma.sipeVinculoVisitante.upsert({
        where: {
          apenadoId_visitanteId: {
            apenadoId,
            visitanteId: vis.id
          }
        },
        create: {
          apenadoId,
          visitanteId: vis.id,
          ativo: v.ativo
        },
        update: {
          ativo: v.ativo
        }
      })
    }
  } catch (err) {
    console.error(`Erro ao sincronizar visitantes na URL ${url}:`, err)
  }
}

function hashCodeLocal(str: string) {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i)
    hash |= 0
  }
  return hash
}

async function scrapeAlcunhas(
  page: Page,
  sipeId: number,
  apenadoId: string
): Promise<void> {
  try {
    const path = `/apenados/${sipeId}/alcunhas`
    const proxyData = await fetchSipeViaProxy(path)
    if (proxyData && !proxyData.is_binary && proxyData.html) {
      await page.setContent(proxyData.html)
    } else {
      await gotoSipeWithFallback(page, path, { waitUntil: 'domcontentloaded' })
    }
    await page.waitForSelector('table, .empty-message, body', { timeout: 10_000 })

    const rows = await page.$$('table tbody tr')
    for (const row of rows) {
      const cells = await row.$$('td')
      if (cells.length < 2) continue
      const alcunha = (await cells[1].innerText()).trim()
      if (!alcunha) continue
      const exists = await prisma.sipeAlcunha.findFirst({
        where: { apenadoId, alcunha },
      })
      if (!exists) {
        await prisma.sipeAlcunha.create({ data: { apenadoId, alcunha } })
      }
    }
  } catch { /* ignore */ }
}

// ── Advogados ─────────────────────────────────────────────────

async function coletarIdsAdvogados(page: Page, jobId: string): Promise<number[]> {
  log(jobId, 'Iniciando coleta de advogados na listagem do SIPE...')

  if (isPythonSdkEngine()) {
    const proxyData = await fetchSipeViaProxy('/advogados/listaradvogados')
    const html = proxyData?.html ?? proxyData?.text
    if (html) {
      const ajaxPath = extractAjaxPathFromHtml(html)
      if (ajaxPath) {
        const idsViaAjax = await fetchPaginatedIdsViaProxy(ajaxPath, 'advogados')
        if (idsViaAjax.length > 0) {
          log(jobId, `🐍 SDK Python coletou ${idsViaAjax.length} IDs de advogados via DataTables`)
          return idsViaAjax
        }
      }

      const idsViaHtml = extractIdsFromHtml(html, 'advogados')
      if (idsViaHtml.length > 0) {
        log(jobId, `🐍 SDK Python coletou ${idsViaHtml.length} IDs de advogados diretamente do HTML`)
        return idsViaHtml
      }
    }

    log(jobId, '⚠️ SDK Python não conseguiu coletar advogados. Ativando rollback via Playwright.')
  }
  
  await gotoSipeWithFallback(page, '/advogados/listaradvogados', {
    waitUntil: 'domcontentloaded',
    timeout: 20_000,
  })
  await page.waitForSelector('table', { timeout: 15_000 }).catch(() => {})

  // ── Estratégia A: DataTables JS API ──────────────────────────
  const advogadosViaApi = await page.evaluate(() => {
    try {
      const w = window as any
      const tables: Element[] =
        w.$.fn?.dataTable?.fnTables?.(true) ??
        w.DataTable?.tables?.({ visible: true, hidden: false }) ??
        []
      if (!tables.length) return []
      const dt = w.$(tables[0]).DataTable()
      
      const info = dt.page.info()
      if (info.pages > 1) {
        return [] // Se for server-side paginado, aborta para usar Estratégia B
      }

      const data: any[] = dt.rows().data().toArray()
      const ids: number[] = []
      
      for (const row of data) {
        const rowStr = JSON.stringify(row)
        const m = rowStr.match(/\/advogados\/(\d+)\//) || rowStr.match(/\/advogados\/(\d+)/)
        if (m) {
          const parsed = parseInt(m[1])
          if (!isNaN(parsed) && parsed > 0) {
            ids.push(parsed)
          }
        }
      }
      return ids
    } catch { return [] }
  }).catch(() => [])

  if (advogadosViaApi.length > 0) {
    log(jobId, `⚡ Estratégia A (DataTables JS API): ${advogadosViaApi.length} IDs coletados`)
    return [...new Set(advogadosViaApi)]
  }

  log(jobId, '⚠️ Estratégia A sem resultado — tentando estratégia B (fetch direto paginado)')

  // ── Estratégia B: fetch direto com cookies de sessão ─────────
  const advogadosViaFetch = await page.evaluate(async (baseUrl: string) => {
    try {
      const w = window as any
      const tables: Element[] = w.$.fn?.dataTable?.fnTables?.(true) ?? []
      if (!tables.length) return []
      const dt = w.$(tables[0]).DataTable()
      const settings = dt.settings()[0]
      const rawUrl: string = settings?.ajax?.url ?? settings?.ajax ?? settings?.sAjaxSource ?? ''
      if (!rawUrl) return []
      const ajaxUrl = rawUrl.startsWith('http') ? rawUrl : baseUrl + rawUrl

      let allRows: any[] = []
      let start = 0
      const length = 500
      let draw = 1
      let hasMore = true

      while (hasMore) {
        const params = new URLSearchParams({
          draw: String(draw++),
          start: String(start),
          length: String(length),
          'columns[0][data]': '0',
          'order[0][column]': '0',
          'order[0][dir]': 'asc',
        })

        const res = await fetch(ajaxUrl, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: params.toString(),
        })

        if (!res.ok) break

        const json = await res.json()
        const rows: any[] = json?.data ?? json?.aaData ?? []
        if (rows.length === 0) break

        allRows = allRows.concat(rows)

        const totalRecords = json.recordsFiltered ?? json.recordsTotal ?? rows.length
        start += length

        if (allRows.length >= totalRecords || rows.length < length) {
          hasMore = false
        }
      }

      const ids: number[] = []
      for (const row of allRows) {
        const rowStr = JSON.stringify(row)
        const m = rowStr.match(/\/advogados\/(\d+)\//) || rowStr.match(/\/advogados\/(\d+)/)
        if (m) {
          const parsed = parseInt(m[1])
          if (!isNaN(parsed) && parsed > 0) {
            ids.push(parsed)
          }
        }
      }
      return ids
    } catch { return [] }
  }, SIPE_URL).catch(() => [])

  if (advogadosViaFetch.length > 0) {
    log(jobId, `⚡ Estratégia B (fetch direto paginado): ${advogadosViaFetch.length} IDs coletados`)
    return [...new Set(advogadosViaFetch)]
  }

  log(jobId, '⚠️ Estratégia B sem resultado — usando estratégia C (DOM + paginação inteligente)')

  // ── Estratégia C: DOM + paginação com saída inteligente ──────
  // Força DataTables a exibir todas as linhas via API JS se possível
  await page.evaluate(() => {
    try {
      const w = window as any
      const tables: Element[] = w.$.fn?.dataTable?.fnTables?.(true) ?? []
      if (tables.length) w.$(tables[0]).DataTable().page.len(-1).draw()
    } catch {}
  }).catch(() => {})
  await page.waitForTimeout(1000)

  const linksSet = new Set<number>()
  const linksIds: number[] = []

  const extractLinks = async () => {
    const currentLinks = await page.$$eval(
      'tbody a[href*="/detalhaclientes"]',
      (els: Element[]) =>
        (els as HTMLAnchorElement[]).map((el) => {
          const m = el.href.match(/\/advogados\/(\d+)\//) || el.href.match(/\/advogados\/(\d+)/)
          return m ? parseInt(m[1]) : 0
        })
    )
    for (const id of currentLinks) {
      if (id > 0 && !linksSet.has(id)) {
        linksSet.add(id)
        linksIds.push(id)
      }
    }
  }

  const getFirstLinkId = async () => {
    return await page.evaluate(() => {
      const el = document.querySelector('tbody a[href*="/detalhaclientes"]') as HTMLAnchorElement | null
      return el ? el.href : ''
    }).catch(() => '')
  }

  const getInfoText = async () => {
    return await page.evaluate(() => {
      const el = document.querySelector('.dataTables_info, [id*="_info"]')
      return el ? el.textContent || '' : ''
    }).catch(() => '')
  }

  await extractLinks()
  log(jobId, `Página 1: Coletados ${linksIds.length} advogados iniciais`)

  let pageNum = 1
  let continuar = true
  while (continuar) {
    const botaoLocator = page
      .locator('a:has-text("Próxima"), a:has-text("Next"), li.next > a, [data-dt-idx="next"] a, a:has-text("»"), a:has-text(">>")')
      .first()
    const botaoVisivel = await botaoLocator.isVisible().catch(() => false)
    if (!botaoVisivel) break

    const botaoDisabled = await botaoLocator.evaluate((el: Element) =>
      el.closest('li')?.classList.contains('disabled') ||
      el.classList.contains('disabled') ||
      (el as HTMLAnchorElement).tabIndex === -1
    ).catch(() => false)
    if (botaoDisabled) break

    try {
      pageNum++
      log(jobId, `Acessando página ${pageNum} de advogados... (${linksIds.length} coletados até agora)`)

      const primeiroAntes = await getFirstLinkId()
      const infoAntes = await getInfoText()

      await botaoLocator.click()

      // Espera inteligente a página mudar (até 5 segundos)
      let mudou = false
      for (let i = 0; i < 25; i++) { // 25 * 200ms = 5000ms
        await page.waitForTimeout(200)
        const primeiroDepois = await getFirstLinkId()
        const infoDepois = await getInfoText()
        if (primeiroDepois !== primeiroAntes || (infoAntes && infoDepois !== infoAntes)) {
          mudou = true
          break
        }
      }

      if (!mudou) {
        log(jobId, `⚠️ Página ${pageNum} não confirmou alteração visual em 5s. Parando paginação preventiva.`)
        break
      }

      const before = linksIds.length
      await extractLinks()
      const novos = linksIds.length - before
      if (novos === 0) {
        log(jobId, `Nenhum novo registro encontrado na página ${pageNum}. Coleta de IDs concluída.`)
        continuar = false
      }
    } catch (err) {
      log(jobId, `⚠️ Falha ao navegar para página ${pageNum} de advogados: ${err}`)
      continuar = false
    }
  }

  log(jobId, `Coleta de lista concluída com sucesso! Total de advogados encontrados: ${linksIds.length}`)
  return linksIds
}

async function downloadSipeImage(page: Page, photoSrc: string): Promise<Buffer | null> {
  const cleanPhotoSrc = photoSrc.replace(/_fotoUsuario/i, '');
  let base64Data: string | null = null;
  
  if (cleanPhotoSrc.startsWith('data:image/')) {
    base64Data = cleanPhotoSrc;
  } else {
    try {
      const absoluteUrl = new URL(cleanPhotoSrc, page.url()).href;
      base64Data = await page.evaluate(`(async function(url) {
        try {
          var res = await fetch(url);
          if (!res.ok) return null;
          var blob = await res.blob();
          return new Promise(function(resolve) {
            var reader = new FileReader();
            reader.onloadend = function() { resolve(reader.result); };
            reader.readAsDataURL(blob);
          });
        } catch(e) {
          return null;
        }
      })("${absoluteUrl.replace(/"/g, '\\"')}")`) as string | null;
    } catch {}

    // Fallback para imagem original com marca d'água se a limpa falhar
    if (!base64Data && cleanPhotoSrc !== photoSrc) {
      try {
        const absoluteUrlFallback = new URL(photoSrc, page.url()).href;
        base64Data = await page.evaluate(`(async function(url) {
          try {
            var res = await fetch(url);
            if (!res.ok) return null;
            var blob = await res.blob();
            return new Promise(function(resolve) {
              var reader = new FileReader();
              reader.onloadend = function() { resolve(reader.result); };
              reader.readAsDataURL(blob);
            });
          } catch(e) {
            return null;
          }
        })("${absoluteUrlFallback.replace(/"/g, '\\"')}")`) as string | null;
      } catch {}
    }
  }

  if (base64Data && base64Data.includes(',')) {
    const base64Content = base64Data.split(',')[1];
    return Buffer.from(base64Content, 'base64');
  }
  return null;
}

export async function scrapeAdvogadoDetalhe(page: Page, sipeId: number, jobId?: string): Promise<void> {
  await gotoSipeWithFallback(page, `/advogados/${sipeId}/detalhaclientes`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('body', { timeout: 10_000 })
  
  // Extração inteligente de dados estruturados do advogado a partir da tabela de perfil
  const dadosAdv = await page.evaluate(`(function() {
    var rows = Array.from(document.querySelectorAll('.profile-user-info-striped .profile-info-row'));
    var getVal = function(name) {
      var row = rows.find(function(r) {
        var nameEl = r.querySelector('.profile-info-name');
        return nameEl && nameEl.textContent.toLowerCase().indexOf(name.toLowerCase()) !== -1;
      });
      if (row) {
        var valEl = row.querySelector('.profile-info-value');
        return valEl ? valEl.textContent.trim() : '';
      }
      return '';
    };

    var img = document.querySelector('.profile-picture img');
    var fotoSrc = img ? img.src : null;

    return {
      nome: getVal('Nome do Advogado'),
      oab: getVal('OAB'),
      cpf: getVal('CPF'),
      endereco: getVal('Endereço'),
      telefone: getVal('Telefone de Contato'),
      dataCadastro: getVal('Data de Cadastro'),
      fotoSrc: fotoSrc
    };
  })()`) as any;

  if (!dadosAdv.nome) return;

  const { nome, oab, cpf, endereco, telefone, dataCadastro, fotoSrc } = dadosAdv;
  const normalizedOab = normalizeOAB(oab);
  const normalizedCpf = normalizeCPF(cpf);

  // Verifica se o advogado já tem foto manual no banco local para evitar sobrescrever
  const advogadoExistente = await prisma.sipeAdvogado.findUnique({
    where: { sipeId },
    select: { photoPath: true }
  });
  const temFotoManual = advogadoExistente?.photoPath?.includes('-manual.webp');

  // Processamento e download da foto do advogado (se houver e não for manual)
  let localPhotoPath: string | null = null;
  if (!temFotoManual && fotoSrc && !fotoSrc.includes('semfoto') && !fotoSrc.includes('sem_foto') && !fotoSrc.includes('default')) {
    try {
      const imageBuffer = await downloadSipeImage(page, fotoSrc);
      if (imageBuffer) {
        const webpBuffer = await sharp(imageBuffer)
          .resize(300, 400, { fit: 'inside', withoutEnlargement: true })
          .webp({ quality: 85 })
          .toBuffer();

        const baseDir = process.env.UPLOAD_DIR || join(process.cwd(), 'uploads');
        const advDir = join(baseDir, 'advogados');
        const { mkdir, writeFile } = await import('fs/promises');
        await mkdir(advDir, { recursive: true });

        const filename = `advogado-${sipeId}.webp`;
        const destPath = join(advDir, filename);
        await writeFile(destPath, webpBuffer);

        localPhotoPath = `uploads/advogados/${filename}`;
        if (jobId) log(jobId, `[SIPE ADVOGADO] Foto do advogado #${sipeId} salva: ${localPhotoPath}`);
      }
    } catch (photoErr) {
      console.error(`[SIPE ADVOGADO] Erro ao baixar foto do advogado SIPE ID ${sipeId}:`, photoErr);
    }
  }

  const adv = await prisma.sipeAdvogado.upsert({
    where: { sipeId },
    create: { 
      sipeId, 
      nome, 
      oab: normalizedOab || null, 
      cpf: normalizedCpf || null, 
      telefone: telefone || null, 
      dataCadastro: dataCadastro || null,
      endereco: endereco || null,
      photoPath: localPhotoPath
    },
    update: { 
      nome, 
      oab: normalizedOab || null, 
      cpf: normalizedCpf || null, 
      telefone: telefone || null, 
      dataCadastro: dataCadastro || null,
      endereco: endereco || null,
      ...(localPhotoPath ? { photoPath: localPhotoPath } : {})
    },
  });

  // Extração estruturada de apenados atendidos a partir do DOM (incluindo foto e situação do vínculo)
  const apenadosAtendidos = await page.evaluate(`(function() {
    var tabelas = Array.from(document.querySelectorAll('table#simple-table'));
    return tabelas.map(function(tabela) {
      var ddElements = Array.from(tabela.querySelectorAll('dd'));
      var dtElements = Array.from(tabela.querySelectorAll('dt'));
      
      var getValByDt = function(label) {
        var index = dtElements.findIndex(function(dt) {
          return (dt.textContent || '').toLowerCase().indexOf(label.toLowerCase()) !== -1;
        });
        return index >= 0 && ddElements[index] ? (ddElements[index].textContent || '').trim() : '';
      };

      var getHrefByDt = function(label) {
        var index = dtElements.findIndex(function(dt) {
          return (dt.textContent || '').toLowerCase().indexOf(label.toLowerCase()) !== -1;
        });
        if (index >= 0 && ddElements[index]) {
          var a = ddElements[index].querySelector('a');
          return a ? a.getAttribute('href') : null;
        }
        return null;
      };

      var img = tabela.querySelector('td img');
      var fotoSrc = img ? img.src : null;

      var labelSpan = tabela.querySelector('td .profile-contact-links span.label');
      var situacao = labelSpan ? (labelSpan.textContent || '').trim().toUpperCase() : 'ATIVA';

      return {
        nome: getValByDt('Nome Apenado'),
        sipeIdText: getValByDt('Cpf'),
        href: getHrefByDt('Nome Apenado'),
        dataNascimento: getValByDt('Data Nascimento'),
        unidade: getValByDt('Unidade Prisional'),
        cela: getValByDt('Cela'),
        tempoPena: getValByDt('Tempo de Pena'),
        fotoSrc: fotoSrc,
        situacao: situacao
      };
    }).filter(function(ap) {
      return ap.nome && ap.nome.trim().length > 0;
    });
  })()`) as any[];

  for (const ap of apenadosAtendidos) {
    let apenadoSipeId: number | null = null

    // 1. Tenta extrair o SIPE ID correto do link href do nome (ex: /apenados/123456/editar)
    if (ap.href) {
      const match = ap.href.match(/\/apenados\/(\d+)/)
      if (match) {
        const parsed = parseInt(match[1])
        if (!isNaN(parsed) && parsed > 0 && parsed <= 2147483647) {
          apenadoSipeId = parsed
        }
      }
    }

    // 2. Se não conseguiu pelo link, limpa caracteres especiais do campo "Cpf" e tenta usar se não estourar Int32
    if (!apenadoSipeId && ap.sipeIdText) {
      const apenasDigitos = ap.sipeIdText.replace(/\D/g, '')
      const parsed = parseInt(apenasDigitos)
      if (!isNaN(parsed) && parsed > 0 && parsed <= 2147483647) {
        apenadoSipeId = parsed
      }
    }

    // Processamento e download da foto do apenado (se houver)
    let apenadoPhotoPath: string | null = null;
    let fotoApenadoAtualizada = false;

    if (apenadoSipeId && apenadoSipeId > 0 && ap.fotoSrc && !ap.fotoSrc.includes('semfoto') && !ap.fotoSrc.includes('sem_foto') && !ap.fotoSrc.includes('default')) {
      try {
        const imageBuffer = await downloadSipeImage(page, ap.fotoSrc);
        if (imageBuffer) {
          const webpBuffer = await sharp(imageBuffer)
            .resize(800, 800, { fit: 'inside', withoutEnlargement: true })
            .webp({ quality: 90 })
            .toBuffer();

          const dir = getApenadosDir();
          const { mkdir, writeFile, readFile } = await import('fs/promises');
          await mkdir(dir, { recursive: true });

          const filename = `sipe-${apenadoSipeId}.webp`;
          const localPath = join(dir, filename);

          let shouldWrite = true;
          if (existsSync(localPath)) {
            try {
              const existingBuffer = await readFile(localPath);
              const currentHash = createHash('sha256').update(webpBuffer).digest('hex');
              const existingHash = createHash('sha256').update(existingBuffer).digest('hex');
              if (currentHash === existingHash) {
                shouldWrite = false;
              }
            } catch {}
          }

          if (shouldWrite) {
            await writeFile(localPath, webpBuffer);
            fotoApenadoAtualizada = true;
          }

          apenadoPhotoPath = `uploads/apenados/${filename}`;
          if (jobId && shouldWrite) {
            log(jobId, `[SIPE ADVOGADO] Foto do apenado SIPE ID #${apenadoSipeId} salva/atualizada: ${apenadoPhotoPath}`);
          }
        }
      } catch (imgErr) {
        console.error(`[SIPE ADVOGADO] Erro ao baixar foto do apenado SIPE ID ${apenadoSipeId}:`, imgErr);
      }
    }

    // Tenta encontrar o apenado no banco pelo sipeId se tivermos um válido
    let apenado = null
    if (apenadoSipeId) {
      apenado = await prisma.sipeApenadoImportado.findUnique({
        where: { sipeId: apenadoSipeId }
      })
    }

    // 3. Fallback: Se não encontramos por sipeId, tenta buscar por Nome exato e Data de Nascimento
    if (!apenado && ap.nome) {
      if (ap.dataNascimento) {
        apenado = await prisma.sipeApenadoImportado.findFirst({
          where: {
            nome: ap.nome,
            dataNascimento: ap.dataNascimento
          }
        })
      }
      if (!apenado) {
        apenado = await prisma.sipeApenadoImportado.findFirst({
          where: { nome: ap.nome }
        })
      }
    }

    // --- Integração com Identificação de Apenados (tabela Apenado local) ---
    const nomeApenadoUpper = (ap.nome || 'SEM NOME').trim().toUpperCase();
    let localApenado = await prisma.apenado.findFirst({
      where: { name: nomeApenadoUpper }
    });

    if (!localApenado) {
      localApenado = await prisma.apenado.create({
        data: {
          name: nomeApenadoUpper,
          unidade: ap.unidade || null,
          photoPath: apenadoPhotoPath || null
        }
      });
    } else {
      const updateDataLocal: any = {};
      if (!localApenado.unidade && ap.unidade) {
        updateDataLocal.unidade = ap.unidade;
      }
      if (apenadoPhotoPath && (fotoApenadoAtualizada || !localApenado.photoPath)) {
        updateDataLocal.photoPath = apenadoPhotoPath;
        
        // Reseta hashes para forçar re-indexação facial no job em background apenas se a foto mudou
        if (fotoApenadoAtualizada) {
          updateDataLocal.photoHash = null;
          updateDataLocal.photoQuality = null;
          updateDataLocal.photoHashSha = null;
          updateDataLocal.faceDescriptor = null;
          updateDataLocal.detScore = null;
        }
      }
      if (Object.keys(updateDataLocal).length > 0) {
        localApenado = await prisma.apenado.update({
          where: { id: localApenado.id },
          data: updateDataLocal
        });
      }
    }

    // 4. Se não encontramos o apenado importado, criamos um registro stub parcial
    if (!apenado) {
      // Se não temos um sipeId válido para criar o registro (ex: CPF maior que 2147483647),
      // geramos um ID fictício negativo e único para manter integridade no banco
      if (!apenadoSipeId) {
        const menorIdApenado = await prisma.sipeApenadoImportado.findFirst({
          where: { sipeId: { lt: 0 } },
          orderBy: { sipeId: 'asc' },
          select: { sipeId: true }
        })
        apenadoSipeId = menorIdApenado ? menorIdApenado.sipeId - 1 : -1000
      }

      const cpfLimpo = ap.sipeIdText ? ap.sipeIdText.replace(/\D/g, '') : null

      apenado = await prisma.sipeApenadoImportado.create({
        data: {
          sipeId: apenadoSipeId,
          nome: ap.nome || 'SEM NOME',
          dataNascimento: ap.dataNascimento || null,
          unidade: ap.unidade || null,
          cela: ap.cela || null,
          tempoPena: ap.tempoPena || null,
          cpf: cpfLimpo && cpfLimpo.length === 11 ? cpfLimpo : null,
          photoPath: apenadoPhotoPath || localApenado.photoPath || null, // Copia a foto
          apenadoLocalId: localApenado.id, // Vincula à identificação local
          ultimaSyncAt: new Date()
        }
      })
    } else {
      // Se ele já existe, atualiza informações básicas
      const updateData: any = {}
      if (!apenado.unidade && ap.unidade) updateData.unidade = ap.unidade
      if (!apenado.cela && ap.cela) updateData.cela = ap.cela
      if (!apenado.tempoPena && ap.tempoPena) updateData.tempoPena = ap.tempoPena
      if (!apenado.dataNascimento && ap.dataNascimento) updateData.dataNascimento = ap.dataNascimento

      if (!apenado.apenadoLocalId) {
        updateData.apenadoLocalId = localApenado.id
      }
      
      if (apenadoPhotoPath && (fotoApenadoAtualizada || !apenado.photoPath)) {
        updateData.photoPath = apenadoPhotoPath;
      } else if (!apenado.photoPath && localApenado.photoPath) {
        updateData.photoPath = localApenado.photoPath;
      }

      const cpfLimpo = ap.sipeIdText ? ap.sipeIdText.replace(/\D/g, '') : ''
      if (!apenado.cpf && cpfLimpo.length === 11) {
        updateData.cpf = cpfLimpo
      }

      if (Object.keys(updateData).length > 0) {
        await prisma.sipeApenadoImportado.update({
          where: { id: apenado.id },
          data: updateData
        })
      }
    }

    // Cria ou atualiza o vínculo de atendimento com o advogado (definindo ativo conforme a situação no SIPE)
    const ehAtivo = ap.situacao === 'ATIVA';

    await prisma.sipeVinculoAdvogado.upsert({
      where: {
        apenadoId_advogadoId: {
          apenadoId: apenado.id,
          advogadoId: adv.id
        }
      },
      create: {
        apenadoId: apenado.id,
        advogadoId: adv.id,
        ativo: ehAtivo
      },
      update: {
        ativo: ehAtivo
      }
    })
  }
}

let lastCnaCaptchaDetectedAt = 0
let lastJobIdNotifiedCnaSuspended: string | null = null
const CNA_COOLDOWN_MS = 10 * 60 * 1000 // 10 minutos

// User-agents variados para evitar fingerprinting
const CNA_USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0'
]

function getRandomUserAgent(): string {
  return CNA_USER_AGENTS[Math.floor(Math.random() * CNA_USER_AGENTS.length)]
}

function generateRandomDelays() {
  return {
    navigation: 2000 + Math.random() * 3000,    // 2-5s
    formFill: 800 + Math.random() * 1200,       // 0.8-2s
    beforeClick: 1000 + Math.random() * 2000,   // 1-3s
    afterClick: 3000 + Math.random() * 4000     // 3-7s
  }
}

export async function scrapeCnaOabDetails(
  page: Page,
  advogadoId: string,
  oabString: string,
  jobId?: string,
  retryAttempt = 1
): Promise<void> {
  const logPrefix = `[CNA OAB]`
  const maxRetries = 3

  // Se detectamos captcha recentemente, suspende temporariamente para evitar spam e lentidão
  const timeSinceCaptcha = Date.now() - lastCnaCaptchaDetectedAt
  if (timeSinceCaptcha < CNA_COOLDOWN_MS) {
    const minutesLeft = Math.ceil((CNA_COOLDOWN_MS - timeSinceCaptcha) / 60000)
    const skipMsg = `${logPrefix} Busca no CNA temporariamente suspensa devido a bloqueio de CAPTCHA recente (tentar novamente em ${minutesLeft} min)`
    if (jobId && lastJobIdNotifiedCnaSuspended !== jobId) {
      log(jobId, skipMsg)
      lastJobIdNotifiedCnaSuspended = jobId
    }
    console.log(skipMsg)
    return
  }

  if (jobId) log(jobId, `${logPrefix} Iniciando consulta da OAB "${oabString}" no CNA... (Tentativa ${retryAttempt}/${maxRetries})`)

  // 1. Parsear OAB (ex: "3092/RO", "12586", "28576/O", "3092A/RO")
  let inscricao = ''
  let uf = 'RO' // Padrão local

  const hasSlash = oabString.includes('/')
  if (hasSlash) {
    const match = oabString.match(/(\d+)(?:-?[A-Za-z])?\/([A-Za-z]{1,2})/i)
    if (match) {
      inscricao = match[1]
      const ufParsed = match[2].toUpperCase()
      // Fallback para siglas incompletas/truncadas (ex: /O ou /R em vez de /RO)
      if (ufParsed === 'O' || ufParsed === 'R') {
        uf = 'RO'
      } else {
        uf = ufParsed
      }
    }
  } else {
    // Apenas dígitos numéricos (ex: "12586")
    const match = oabString.match(/^(\d+)/)
    if (match) {
      inscricao = match[1]
      uf = 'RO'
    }
  }

  if (!inscricao) {
    const errorMsg = `${logPrefix} Formato de OAB inválido para busca: "${oabString}"`
    if (jobId) log(jobId, errorMsg)
    console.warn(errorMsg)
    return
  }

  // 2. Criar uma nova página no contexto do browser para não interferir na sessão do SIPE
  const cnaPage = await page.context().newPage()

  const delays = generateRandomDelays()

  // Monitorar respostas HTTP para detecção precisa e instantânea de CAPTCHA
  let apiCaptchaDetected = false
  cnaPage.context().on('response', async (response) => {
    const url = response.url()
    if (url.includes('/api/advogado/search')) {
      if (response.status() === 428) {
        apiCaptchaDetected = true
      } else {
        try {
          const text = await response.text()
          if (text.includes('recaptcha_fallback_required') || text.includes('Recaptcha score below threshold')) {
            apiCaptchaDetected = true
          }
        } catch {}
      }
    }
  })

  try {
    cnaPage.setDefaultTimeout(20000)

    // Ocultar flags de automação e adicionar headers realistas
    await cnaPage.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined })
      Object.defineProperty(navigator, 'plugins', { get: () => [] })
      Object.defineProperty(navigator, 'languages', { get: () => ['pt-BR', 'pt'] })
    })

    await cnaPage.setExtraHTTPHeaders({
      'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
      'Referer': 'https://cna.oab.org.br'
    })

    // Ir para a página do CNA com delay natural
    if (jobId) log(jobId, `${logPrefix} Acessando cna.oab.org.br...`)
    await cnaPage.goto('https://cna.oab.org.br/', { waitUntil: 'networkidle', timeout: 30000 })
    await cnaPage.waitForTimeout(delays.navigation)

    // Preencher campos forçando eventos reativos do Angular com delay entre ações
    if (jobId) log(jobId, `${logPrefix} Preenchendo campos de busca (OAB: ${oabString}, UF: ${uf})...`)

    await cnaPage.evaluate(({ inscricao, uf }) => {
      const regInput = document.querySelector('input[name="registration"]') as HTMLInputElement
      if (regInput) {
        regInput.value = inscricao
        regInput.dispatchEvent(new Event('input', { bubbles: true }))
        regInput.dispatchEvent(new Event('change', { bubbles: true }))
      }

      const sectSelect = document.querySelector('select[name="sectional"]') as HTMLSelectElement
      if (sectSelect) {
        sectSelect.value = uf
        sectSelect.dispatchEvent(new Event('change', { bubbles: true }))
      }

      const typeSelect = document.querySelector('select[name="registrationType"]') as HTMLSelectElement
      if (typeSelect) {
        typeSelect.value = '1' // 1 = Advogado
        typeSelect.dispatchEvent(new Event('change', { bubbles: true }))
      }
    }, { inscricao, uf })

    await cnaPage.waitForTimeout(delays.formFill)

    // Aguardar antes de clicar (padrão humano)
    await cnaPage.waitForTimeout(delays.beforeClick)

    // Pesquisar
    if (jobId) log(jobId, `${logPrefix} Clicando em pesquisar...`)
    await cnaPage.click('button:has-text("Pesquisar")')

    // Aguardar com delay natural após clique
    await cnaPage.waitForTimeout(delays.afterClick)

    // Esperar de forma inteligente por sucesso ou falha/captcha (máximo de 8 segundos com delays)
    for (let i = 0; i < 16; i++) {
      await cnaPage.waitForTimeout(500)
      if (apiCaptchaDetected) {
        break
      }

      // Se a lista de resultados ou "Nenhum resultado" apareceu, para de esperar
      const resultsFound = await cnaPage.evaluate(() => {
        // Verifica se a seção de sem resultados está visível (não tem a classe opacity-0)
        const noResultSec = document.querySelector('app-cna section.bg-blue-100')
        const hasNoResult = noResultSec ? !noResultSec.className.includes('opacity-0') : false

        // Verifica se a lista de resultados está visível
        const resultSec = document.querySelector('app-cna section.pt-16 ~ section')
        const hasResults = resultSec ? (!resultSec.className.includes('opacity-0') && document.querySelectorAll('app-cna li button').length > 0) : false

        return hasNoResult || hasResults
      })
      if (resultsFound) {
        break
      }
    }

    if (apiCaptchaDetected) {
      const captchaMsg = `${logPrefix} Bloqueado por CAPTCHA ao consultar OAB "${oabString}". Tentando resolver com Capsolver...`
      if (jobId) log(jobId, captchaMsg)
      console.warn(captchaMsg)

      // Tentar resolver CAPTCHA com Capsolver
      try {
        const sitekey = await capsolverService.detectRecaptchaKey(cnaPage)
        if (sitekey) {
          const token = await capsolverService.solveRecaptchaV3(
            'https://cna.oab.org.br/',
            sitekey,
            'submit'
          )

          if (token) {
            // Injectar token e tentar novamente
            await capsolverService.injectRecaptchaToken(cnaPage, token)
            await cnaPage.waitForTimeout(2000)

            const resolvedMsg = `${logPrefix} ✅ CAPTCHA resolvido com Capsolver! Retentando requisição...`
            if (jobId) log(jobId, resolvedMsg)
            console.log(resolvedMsg)

            // Reseta a flag de CAPTCHA e tenta novamente
            apiCaptchaDetected = false

            // Tenta fechar qualquer modal/dialog que possa estar bloqueando
            let modalClosed = false
            for (let attempt = 0; attempt < 5; attempt++) {
              try {
                const closed = await cnaPage.evaluate(() => {
                  const dialog = document.querySelector('[role="dialog"], .modal, .dialog, [aria-modal="true"]')
                  if (dialog) {
                    // Tenta encontrar botão de fechar
                    const closeBtn = dialog.querySelector('[aria-label*="close"], [aria-label*="Close"], button.close, .btn-close, [aria-label="close"]')
                    if (closeBtn) {
                      (closeBtn as HTMLElement).click()
                      return 'button'
                    }
                    // Tenta pressionar Escape via dialog
                    const event = new KeyboardEvent('keydown', {
                      key: 'Escape',
                      code: 'Escape',
                      keyCode: 27,
                      bubbles: true
                    })
                    dialog.dispatchEvent(event)
                    return 'escape'
                  }
                  return false
                })

                if (closed) {
                  console.log(`[CNA] Modal fechado (${closed})`)
                  await cnaPage.waitForTimeout(800) // Aguarda animação
                  modalClosed = true
                  break
                }
              } catch (e) {
                // Ignora erro ao tentar fechar modal
              }

              if (attempt < 4) {
                await cnaPage.waitForTimeout(300)
              }
            }

            // Aguarda que o modal desapareça ou o botão Pesquisar fique clicável
            try {
              await cnaPage.waitForSelector('button:has-text("Pesquisar"):not(:disabled)', { timeout: 3000 })
            } catch {
              // Se timeout, tenta mesmo assim
            }

            // Retorna para clicar novamente em pesquisar
            await cnaPage.click('button:has-text("Pesquisar")')
            await cnaPage.waitForTimeout(delays.afterClick)

            // Re-avalia os resultados
            for (let i = 0; i < 16; i++) {
              await cnaPage.waitForTimeout(500)
              if (apiCaptchaDetected) break

              const resultsFound = await cnaPage.evaluate(() => {
                const noResultSec = document.querySelector('app-cna section.bg-blue-100')
                const hasNoResult = noResultSec ? !noResultSec.className.includes('opacity-0') : false
                const resultSec = document.querySelector('app-cna section.pt-16 ~ section')
                const hasResults = resultSec ? (!resultSec.className.includes('opacity-0') && document.querySelectorAll('app-cna li button').length > 0) : false
                return hasNoResult || hasResults
              })
              if (resultsFound) break
            }

            // Se CAPTCHA foi detectado novamente, desistir
            if (apiCaptchaDetected) {
              lastCnaCaptchaDetectedAt = Date.now()
              throw new Error('CNA_CAPTCHA_DETECTED')
            }
          } else {
            // Falhou em resolver
            lastCnaCaptchaDetectedAt = Date.now()
            const failMsg = `${logPrefix} Falha ao resolver CAPTCHA com Capsolver. Ativando cooldown de 10 minutos.`
            if (jobId) log(jobId, failMsg)
            console.warn(failMsg)
            throw new Error('CNA_CAPTCHA_DETECTED')
          }
        } else {
          // Não detectou a chave do CAPTCHA
          lastCnaCaptchaDetectedAt = Date.now()
          throw new Error('CNA_CAPTCHA_DETECTED')
        }
      } catch (err: any) {
        if (err?.message === 'CNA_CAPTCHA_DETECTED') throw err

        // Erro ao tentar resolver, ativar cooldown
        lastCnaCaptchaDetectedAt = Date.now()
        const errorMsg = `${logPrefix} Erro ao tentar resolver CAPTCHA: ${err?.message}. Ativando cooldown.`
        if (jobId) log(jobId, errorMsg)
        console.error(errorMsg)
        throw new Error('CNA_CAPTCHA_DETECTED')
      }
    }

    // Clicar no resultado correspondente ao advogado na lista do lado direito
    const clicked = await cnaPage.evaluate((oabNum) => {
      const items = Array.from(document.querySelectorAll('*')).filter(el => {
        const text = el.textContent || '';
        return text.includes(oabNum) && 
               el.tagName !== 'BODY' && el.tagName !== 'HTML' && 
               el.tagName !== 'SCRIPT' && el.tagName !== 'STYLE';
      });
      if (items.length > 0) {
        let leaf = items[0] as HTMLElement;
        for (const item of items) {
          if (leaf.contains(item) && item !== leaf) {
            leaf = item as HTMLElement;
          }
        }
        leaf.click();
        return true;
      }
      return false;
    }, inscricao)

    if (!clicked) {
      const notFoundMsg = `${logPrefix} Advogado com OAB "${oabString}" não encontrado no CNA`
      if (jobId) log(jobId, notFoundMsg)
      console.log(notFoundMsg)
      return
    }

    // Aguardar detalhes
    await cnaPage.waitForTimeout(3000)

    // Extrair dados
    const profileData = await cnaPage.evaluate(() => {
      const text = document.body.innerText || '';
      
      const imgs = Array.from(document.querySelectorAll('img'));
      const ignoreList = ['cna.svg', 'app_store.png', 'googleplay.png'];
      const profileImg = imgs.find(img => {
        const src = img.src || '';
        return src && !ignoreList.some(ignore => src.includes(ignore));
      });

      const telMatch = text.match(/(?:Telefone|Telefone Profissional|Contatos?|Fones?)\s*:\s*([^\n]+)/i) || 
                       text.match(/(?:Telefone|Telefone Profissional)\s+([^\n]+)/i);
      
      const endMatch = text.match(/(?:Endereço|Endereço Profissional|Endereço de correspondência)\s*:\s*([^\n]+(?:\n[^\n]+){0,2})/i) ||
                       text.match(/(?:Endereço|Endereço Profissional)\s+([^\n]+(?:\n[^\n]+){0,2})/i);

      return {
        photoSrc: profileImg ? profileImg.src : null,
        telefone: telMatch ? telMatch[1].trim() : null,
        endereco: endMatch ? endMatch[1].trim() : null
      };
    });

    let photoPath: string | null = null

    if (profileData.photoSrc) {
      try {
        let imageBuffer: Buffer | null = null

        if (profileData.photoSrc.startsWith('data:image/')) {
          const base64Content = profileData.photoSrc.split(',')[1]
          imageBuffer = Buffer.from(base64Content, 'base64')
        } else {
          const res = await fetch(profileData.photoSrc)
          if (res.ok) {
            imageBuffer = Buffer.from(await res.arrayBuffer())
          }
        }

        if (imageBuffer) {
          const webpBuffer = await sharp(imageBuffer)
            .resize(300, 400, { fit: 'inside', withoutEnlargement: true })
            .webp({ quality: 85 })
            .toBuffer()

          const { mkdir, writeFile } = await import('fs/promises')
          const baseDir = process.env.UPLOAD_DIR || join(process.cwd(), 'uploads')
          const advDir = join(baseDir, 'advogados')
          await mkdir(advDir, { recursive: true })

          const filename = `advogado-${advogadoId}.webp`
          const localPath = join(advDir, filename)
          await writeFile(localPath, webpBuffer)

          photoPath = `uploads/advogados/${filename}`
        }
      } catch (imgErr) {
        console.error(`${logPrefix} Erro ao processar imagem de OAB "${oabString}":`, imgErr)
      }
    }

    const updatePayload: any = {}
    if (profileData.telefone) updatePayload.telefone = profileData.telefone
    if (profileData.endereco) updatePayload.endereco = profileData.endereco
    // Nota: photoPath não é suportado em sipeAdvogado (schema não tem esse campo)
    // Se precisar salvar foto, usar sipeFoto ou outro modelo dedicado

    if (Object.keys(updatePayload).length > 0) {
      await prisma.sipeAdvogado.update({
        where: { id: advogadoId },
        data: updatePayload
      })

      const successMsg = `${logPrefix} Dados atualizados com sucesso para OAB "${oabString}"`
      if (jobId) log(jobId, successMsg)
      console.log(successMsg)
    } else {
      if (jobId) log(jobId, `${logPrefix} Nenhum dado novo encontrado no CNA para OAB "${oabString}"`)
    }

  } catch (err: any) {
    // Se foi CAPTCHA e ainda temos tentativas, fazer retry com backoff exponencial
    if (err?.message === 'CNA_CAPTCHA_DETECTED' && retryAttempt < maxRetries) {
      const baseDelay = 30000 // 30 segundos
      const exponentialDelay = baseDelay * Math.pow(2, retryAttempt - 1) // 30s, 60s, 120s
      const minutes = Math.ceil(exponentialDelay / 60000)

      const retryMsg = `${logPrefix} CAPTCHA detectado (tentativa ${retryAttempt}/${maxRetries}). Aguardando ${minutes} minuto(s) antes de nova tentativa...`

      if (jobId) log(jobId, retryMsg)
      console.log(retryMsg)

      await new Promise(r => setTimeout(r, exponentialDelay))

      // Recursivamente tenta novamente com novo contexto
      return scrapeCnaOabDetails(page, advogadoId, oabString, jobId, retryAttempt + 1)
    }

    // Se foi outra falha, relançar o erro
    throw err
  } finally {
    await cnaPage.close().catch(() => {})
  }
}

// ── Facções ───────────────────────────────────────────────────

export async function scrapeFaccoes(jobId?: string, unidadeId = SIPE_UNIDADE, engine?: SipeEngine): Promise<void> {
  if (engine) {
    setCurrentSipeEngine(engine, unidadeId)
  }

  const context = await createSession()
  const page = await context.newPage()
  markFallbackSessionDirty(page)
  try {
    let options: { value: string; text: string }[] = []
    let extraido = false
    let erroOriginal: any = null

    console.log('[FACCOES] 🔍 Iniciando scrape de facções...')

    if (isPythonSdkEngine()) {
      const apenadoIds = await coletarIdsApenados(page, unidadeId, jobId ?? 'FACCOES', null, false)

      for (let i = 0; i < apenadoIds.length; i++) {
        const apenadoId = apenadoIds[i]
        const progress = `[${i + 1}/${apenadoIds.length}]`

        try {
          console.log(`[FACCOES] ${progress} Tentando via SDK Python /apenados/${apenadoId}/faccao...`)
          const proxyData = await fetchSipeViaProxy(`/apenados/${apenadoId}/faccao`)
          const html = proxyData?.html ?? proxyData?.text
          if (!html || html.includes('Trying to get property')) {
            continue
          }

          await page.setContent(html)
          const extractedOptions = await page.evaluate(() => {
            const candidates = Array.from(document.querySelectorAll('select'))
            for (const select of candidates) {
              const options = Array.from(select.querySelectorAll('option'))
                .filter((o) => o.value && o.value !== '0' && o.value !== '')
                .map((o) => ({ value: o.value, text: o.textContent?.trim() ?? '' }))

              if (options.length === 0) continue

              const hasGender = options.some((opt) => {
                const text = opt.text.toLowerCase()
                return text.includes('masculino') || text.includes('feminino') || text.includes('não informado')
              })

              if (!hasGender) {
                return options
              }
            }
            return [] as Array<{ value: string; text: string }>
          })

          if (extractedOptions.length > 0) {
            options = extractedOptions
            extraido = true
            console.log(`[FACCOES] 🐍 Lista de facções obtida via SDK com ${options.length} opções`)
            break
          }
        } catch (err) {
          erroOriginal = err
        }
      }
    }

    if (!extraido) {
      await ensureFallbackLogin(page)
    }

    if (!extraido) {
      // 1. Acessa /apenados/index para extrair IDs dos apenados listados na unidade
      console.log('[FACCOES] 📄 Acessando /apenados/index...')
      await gotoSipeWithFallback(page, '/apenados/index', { waitUntil: 'domcontentloaded' })
      await page.waitForSelector('tbody', { timeout: 15_000 }).catch(() => {})

      const links = await page.$$('tbody a[href*="/selecionarOpcao"]')
      const apenadoIds: number[] = []

      for (const link of links) {
        const href = await link.getAttribute('href')
        if (!href) continue
        const m = href.match(/\/apenados\/(\d+)/)
        if (m) {
          const parsedId = parseInt(m[1])
          if (!isNaN(parsedId) && parsedId > 0) {
            apenadoIds.push(parsedId)
          }
        }
      }

      console.log(`[FACCOES] 🔗 Encontrados ${apenadoIds.length} apenados na listagem ativa do SIPE`)

      // 2. Fallback: Ler também apenados da base de dados local se a listagem na página estiver muito pequena
      if (apenadoIds.length < 10) {
        console.log(`[FACCOES] ⚠️ Listagem na página pequena (${apenadoIds.length} apenados). Carregando fallback do banco local...`)
        const apenadosBanco = await prisma.sipeApenadoImportado.findMany({
          where: { sipeId: { gt: 0 } },
          select: { sipeId: true },
          orderBy: { sipeId: 'desc' },
          take: 50
        })
        for (const ab of apenadosBanco) {
          if (!apenadoIds.includes(ab.sipeId)) {
            apenadoIds.push(ab.sipeId)
          }
        }
        console.log(`[FACCOES] 📊 Lista final de apenados para varredura: ${apenadoIds.length}`)
      }

      // 3. Varredura: Procuramos por um apenado com facção (faccao_id > 0 na rota /editar)
      for (let i = 0; i < apenadoIds.length; i++) {
        const apenadoId = apenadoIds[i]
        const progress = `[${i + 1}/${apenadoIds.length}]`

        try {
          console.log(`[FACCOES] ${progress} Verificando perfil /editar do apenado SIPE ID #${apenadoId}...`)
          await gotoSipeWithFallback(page, `/apenados/${apenadoId}/editar`, { waitUntil: 'domcontentloaded', timeout: 15_000 })

        const faccaoIdVal = await page.evaluate(() => {
          const el = document.querySelector('[name="faccao_id"]') as HTMLInputElement | null
          return el ? el.value : null
        })

        console.log(`[FACCOES]   -> faccao_id: "${faccaoIdVal}"`)

        if (faccaoIdVal && faccaoIdVal !== '0' && faccaoIdVal !== '') {
          console.log(`[FACCOES] 🌟 Apenado SIPE ID #${apenadoId} possui facção vinculada! Acessando página /faccao...`)
          
          await gotoSipeWithFallback(page, `/apenados/${apenadoId}/faccao`, { waitUntil: 'load', timeout: 20_000 })
          
          const htmlContent = await page.content()
          if (htmlContent.includes("Trying to get property")) {
            console.log(`[FACCOES] ❌ Página /faccao deu erro PHP para o apenado #${apenadoId}, pulando...`)
            continue
          }

          // Tenta múltiplos seletores para o select de facção
          let selectLocator
          const selectors = [
            'select[name="faccao_id"]',
            'select[name*="faccao"]',
            'select[id*="faccao"]',
            'select'
          ]

          for (const sel of selectors) {
            try {
              const elem = page.locator(sel).first()
              await elem.waitFor({ state: 'attached', timeout: 6_000 })

              // Verificar se é realmente de facção (não gênero)
              const testOptions = await elem.locator('option').evaluateAll((opts: HTMLOptionElement[]) =>
                opts
                  .filter((o) => o.value && o.value !== '0' && o.value !== '')
                  .map((o) => o.textContent?.trim() ?? '')
              )

              // Descartar select de gênero
              const hasGender = testOptions.some(opt =>
                opt.toLowerCase().includes('masculino') ||
                opt.toLowerCase().includes('feminino') ||
                opt.toLowerCase().includes('não informado')
              )

              if (hasGender) {
                continue // Pula este seletor
              }

              selectLocator = elem
              break
            } catch {
              // tenta próximo
            }
          }

          if (!selectLocator) {
            console.log(`[FACCOES] ⚠️ Nenhum select de facção válido localizado na página /faccao de #${apenadoId}`)
            continue
          }

          options = await selectLocator.locator('option').evaluateAll((opts: HTMLOptionElement[]) =>
            opts
              .filter((o) => o.value && o.value !== '0' && o.value !== '')
              .map((o) => ({ value: o.value, text: o.textContent?.trim() ?? '' }))
          )

          // Validação final de gênero
          const hasGenderInFinal = options.some(opt =>
            opt.text.toLowerCase().includes('masculino') ||
            opt.text.toLowerCase().includes('feminino')
          )

          if (hasGenderInFinal) {
            console.log(`[FACCOES] ❌ Select extraído de #${apenadoId} continha gênero, descartado.`)
            continue
          }

          if (options.length > 0) {
            console.log(`[FACCOES] 📊 Facções encontradas: ${options.length}`)
            console.log(`[FACCOES] 📋 Lista: ${options.map(o => o.text).join(', ')}`)
            extraido = true
            break // Sucesso total! Sai do loop de varredura.
          }
        }
        } catch (err) {
          console.log(`[FACCOES] ⚠️ Erro ao varrer apenado #${apenadoId}: ${(err as any)?.message || err}`)
          erroOriginal = err
        }

        await page.waitForTimeout(300)
      }
    }

    if (!extraido) {
      const errMsg = `Não foi possível carregar a lista de facções em nenhum dos apenados testados. ` +
        `Erro original: ${(erroOriginal as any)?.message || erroOriginal}`
      console.log(`[FACCOES] ❌ ${errMsg}`)
      throw new Error(errMsg)
    }

    console.log(`[FACCOES] 💾 Salvando ${options.length} facções no banco...`)

    let count = 0
    for (const opt of options) {
      const id = parseInt(opt.value)
      if (isNaN(id)) continue

      let nome = opt.text
      let sigla: string | null = null
      let cor = '#ef4444' // Cor padrão

      const nomeUpper = opt.text.toUpperCase()
      const ehCompanheiro = nomeUpper.includes('COMPANHEIRO DE FACÇÃO')
      if (
        (ehCompanheiro && (nomeUpper.includes('CV') || nomeUpper.includes('COMANDO VERMELHO'))) || 
        nomeUpper === 'CV' || 
        nomeUpper === 'COMANDO VERMELHO'
      ) {
        nome = 'Comando Vermelho'
        sigla = 'CV'
        cor = '#dc2626' // Vermelho escuro
      } else if (
        (ehCompanheiro && (nomeUpper.includes('PCC') || nomeUpper.includes('PRIMEIRO COMANDO DA CAPITAL'))) || 
        nomeUpper === 'PRIMEIRO COMANDO DA CAPITAL' || 
        nomeUpper === 'PCC'
      ) {
        nome = 'Primeiro Comando da Capital'
        sigla = 'PCC'
        cor = '#1d4ed8' // Azul escuro
      } else if (nomeUpper.includes('FAMÍLIA DO NORTE') || nomeUpper === 'FDN') {
        nome = 'Família do Norte'
        sigla = 'FDN'
        cor = '#15803d' // Verde
      } else if (nomeUpper.includes('PRIMEIRO COMANDO DO PANDA') || nomeUpper === 'PCP') {
        nome = 'Primeiro Comando do Panda'
        sigla = 'PCP'
        cor = '#b45309' // Âmbar escuro
      } else if (nomeUpper.includes('BONDE DOS 13') || nomeUpper === 'B13') {
        nome = 'Bonde dos 13'
        sigla = 'B13'
        cor = '#4338ca' // Índigo
      } else if (nomeUpper.includes('COMANDO CLASSE A') || nomeUpper === 'CCA') {
        nome = 'Comando Classe A'
        sigla = 'CCA'
        cor = '#6d28d9' // Violeta
      } else if (ehCompanheiro || nomeUpper === 'CF') {
        nome = 'Companheiro de Facção'
        sigla = 'CF'
        cor = '#4b5563' // Cinza
      }

      await prisma.sipeFaccao.upsert({
        where: { sipeId: id },
        create: {
          sipeId: id,
          nome,
          sigla,
          cor,
        },
        update: {
          nome,
          sigla,
          cor,
        },
      })
      count++
    }

    console.log(`[FACCOES] ✅ ${count} facções salvas com sucesso`)
  } finally {
    await context.close()
  }
}

async function scrapeEndereço(
  page: Page,
  sipeId: number,
  apenadoId: string,
): Promise<void> {
  try {
    const path = `/apenados/${sipeId}/enderecos`
    const proxyData = await fetchSipeViaProxy(path)
    let status: number | undefined
    
    if (proxyData && !proxyData.is_binary && proxyData.html) {
      await page.setContent(proxyData.html)
      status = 200
    } else {
      const response = await gotoSipeWithFallback(page, path, { waitUntil: 'domcontentloaded', timeout: 15_000 })
      status = response?.status()
      
      // Proteção contra redirecionamentos (ex: login expirado, falta de permissão ou apenado não existente)
      const currentUrl = page.url()
      if (
        currentUrl.includes('/login') ||
        currentUrl === `${SIPE_URL}/` ||
        currentUrl === `${SIPE_URL}` ||
        currentUrl.includes('/selectRole') ||
        currentUrl.includes('/home')
      ) {
        console.warn(`[scrapeEndereço] Acesso recusado ou redirecionado para ${currentUrl} ao tentar acessar o apenado ${sipeId}`)
        return
      }
    }

    if (status && (status === 404 || status === 403 || status === 500)) {
      console.warn(`[scrapeEndereço] Acesso recusado com status ${status} ao tentar acessar o apenado ${sipeId}`)
      return
    }


    // Espera especificamente pelo formulário de inclusão ou pela tabela de cadastrados.
    // Removemos o ", body" para evitar que o Playwright prossiga antes da página carregar de fato.
    await page.waitForSelector('[name="rua_endereco"], tr[id^="view_"]', { timeout: 10_000 }).catch(() => {})

    // Revalida a URL após a espera para garantir que não fomos redirecionados por JS assíncrono
    if (
      page.url().includes('/login') ||
      page.url().includes('/selectRole') ||
      page.url().includes('/home')
    ) {
      console.warn(`[scrapeEndereço] Redirecionado após espera para ${page.url()} no apenado ${sipeId}`)
      return
    }

    const endereco = await page.evaluate(() => {
      const viewRow = document.querySelector('tr[id^="view_"]')
      if (!viewRow) {
        // Se não tem linha de visualização, mas a página está correta, tenta ler do formulário de inclusão (caso esteja preenchido)
        const logradouro = (document.querySelector('[name="rua_endereco"]') as HTMLInputElement | null)?.value?.trim() || null
        const numero = (document.querySelector('[name="numero_endereco"]') as HTMLInputElement | null)?.value?.trim() || null
        const complemento = (document.querySelector('[name="complemento_endereco"]') as HTMLInputElement | null)?.value?.trim() || null
        const bairro = (document.querySelector('[name="bairro_endereco"]') as HTMLInputElement | null)?.value?.trim() || null

        const estEl = document.querySelector('[name="estado_id"]') as HTMLSelectElement | null
        const uf = estEl?.options[estEl.selectedIndex]?.text?.trim() || null

        const cidEl = document.querySelector('[name="cidade_id"]') as HTMLSelectElement | null
        const cidade = cidEl?.options[cidEl.selectedIndex]?.text?.trim() || null

        const cep = (document.querySelector('[name="cep_endereco"]') as HTMLInputElement | null)?.value?.trim() ||
                    (document.querySelector('[name="cep"]') as HTMLInputElement | null)?.value?.trim() || null

        // Se todos os campos estiverem nulos, pode ser que o apenado de fato não possua nenhum endereço cadastrado
        return {
          logradouro,
          numero,
          complemento,
          bairro,
          cidade,
          uf,
          cep,
          existe: !!(logradouro || bairro || cidade)
        }
      }

      const cells = Array.from(viewRow.children)
      const idMatch = viewRow.id.match(/\d+/)
      const addrId = idMatch ? idMatch[0] : ''

      const logradouro = document.getElementById(`view_rua_endereco${addrId}`)?.textContent?.trim() || null
      const numero = document.getElementById(`view_numero_endereco${addrId}`)?.textContent?.trim() || null
      const complemento = document.getElementById(`view_complemento_endereco${addrId}`)?.textContent?.trim() || null
      const bairro = document.getElementById(`view_bairro_endereco${addrId}`)?.textContent?.trim() || null

      const cidadeEstado = cells[5]?.textContent?.trim() || ''
      let cidade = null
      let uf = null

      if (cidadeEstado && cidadeEstado.includes('-')) {
        const parts = cidadeEstado.split('-')
        cidade = parts[0].trim()
        uf = parts[1].trim()
      } else if (cidadeEstado) {
        cidade = cidadeEstado
      }

      const cep = (document.querySelector('[name="cep_endereco"]') as HTMLInputElement | null)?.value?.trim() || null

      return {
        logradouro,
        numero,
        complemento,
        bairro,
        cidade,
        uf,
        cep,
        existe: true
      }
    })

    // Só atualiza os dados se a extração encontrou dados consistentes ou se foi confirmado que a página carregou e o apenado realmente não tem endereço cadastrado.
    // Se a página retornou um formulário vazio (ou seja, existe = false), salvamos os campos como null (indicando ausência de endereço).
    // Mas se por acaso a página estiver quebrada e nem sequer renderizar os seletores, evitamos apagar dados existentes.
    const hasForm = await page.evaluate(() => document.querySelector('form#formulario') !== null || document.querySelector('table') !== null)
    if (!endereco.existe && !hasForm) {
      console.warn(`[scrapeEndereço] Página de endereços do apenado ${sipeId} não parece ter carregado os formulários ou tabelas corretamente. Ignorando atualização para evitar perda de dados.`)
      return
    }

    const ufLimpa = endereco.uf && !endereco.uf.includes('Selecione') && !endereco.uf.includes('Escolha') ? endereco.uf : null
    const cidadeLimpa = endereco.cidade && !endereco.cidade.includes('Selecione') && !endereco.cidade.includes('Escolha') ? endereco.cidade : null

    // Atualizar apenado com endereço
    await prisma.sipeApenadoImportado.update({
      where: { id: apenadoId },
      data: {
        logradouro: endereco.logradouro,
        numero: endereco.numero,
        complemento: endereco.complemento,
        bairro: endereco.bairro,
        cidade: cidadeLimpa,
        uf: ufLimpa,
        cep: endereco.cep,
      },
    })
  } catch (err) {
    console.error(`Erro ao sincronizar endereço do apenado ${sipeId}:`, err)
  }
}

export async function scrapeHistorico(
  page: Page,
  sipeId: number,
  apenadoId: string,
): Promise<void> {
  // 1. Coleta e salva as mudanças de cela existentes
  try {
    const path = `/apenados/${sipeId}/mudarcela`
    const proxyData = await fetchSipeViaProxy(path)
    if (proxyData && !proxyData.is_binary && proxyData.html) {
      await page.setContent(proxyData.html)
    } else {
      await gotoSipeWithFallback(page, path, { waitUntil: 'domcontentloaded' })
    }
    await page.waitForSelector('table, .empty-message, body', { timeout: 10_000 })


    const headers = await page.$$eval('table thead tr th, table thead tr td, table tr:first-child th, table tr:first-child td', (elements) => {
      return elements.map(el => el.textContent?.toUpperCase().trim() || '')
    }).catch(() => [] as string[])

    let unidadeIndex = -1
    let dataIndex = -1
    let celaDeIndex = -1
    let celaParaIndex = -1
    let motivoIndex = -1

    headers.forEach((text, idx) => {
      if (text.includes('UNIDADE') || text.includes('ESTABELECIMENTO')) unidadeIndex = idx
      if (text.includes('DATA')) {
        if (!text.includes('CELA') && !text.includes('MOTIVO')) dataIndex = idx
      }
      if (text.includes('CELA DE') || text.includes('CELA ORIGEM') || (text.includes('CELA') && text.includes('DE'))) celaDeIndex = idx
      if (text.includes('CELA PARA') || text.includes('CELA DESTINO') || (text.includes('CELA') && text.includes('PARA'))) celaParaIndex = idx
      if (text.includes('MOTIVO')) motivoIndex = idx
    })

    if (dataIndex === -1) {
      unidadeIndex = 0
      dataIndex = 1
      celaDeIndex = 2
      celaParaIndex = 3
      motivoIndex = 4
    }

    const rows = await page.$$('table tbody tr')
    for (const row of rows) {
      const cells = await row.$$('td')
      if (cells.length < 5) continue

      const unidadePrisional = unidadeIndex >= 0 && cells.length > unidadeIndex ? (await cells[unidadeIndex]?.innerText())?.trim() || '' : ''
      const dataStr = dataIndex >= 0 && cells.length > dataIndex ? (await cells[dataIndex]?.innerText())?.trim() || '' : ''
      const motivo = motivoIndex >= 0 && cells.length > motivoIndex ? (await cells[motivoIndex]?.innerText())?.trim() || '' : ''
      const celaDe = celaDeIndex >= 0 && cells.length > celaDeIndex ? (await cells[celaDeIndex]?.innerText())?.trim() || '' : ''
      const celaPara = celaParaIndex >= 0 && cells.length > celaParaIndex ? (await cells[celaParaIndex]?.innerText())?.trim() || '' : ''

      if (!dataStr) continue

      let datahora: Date | null = null
      try {
        const parts = dataStr.split(' ')
        const dateParts = parts[0].split('/')
        if (dateParts.length === 3) {
          const timeParts = parts[1] ? parts[1].split(':') : ['00', '00']
          datahora = new Date(
            parseInt(dateParts[2]),
            parseInt(dateParts[1]) - 1,
            parseInt(dateParts[0]),
            parseInt(timeParts[0] || '00'),
            parseInt(timeParts[1] || '00')
          )
        }
      } catch {
        datahora = new Date(dataStr)
      }

      const tipo = 'TRANSFERENCIA'
      const partsDesc = []
      if (unidadePrisional) partsDesc.push(`Unidade: ${unidadePrisional}`)
      partsDesc.push(`De: ${celaDe}`)
      partsDesc.push(`Para: ${celaPara}`)
      if (motivo) partsDesc.push(`Motivo: ${motivo}`)
      const descricao = `Mudança de cela. ${partsDesc.join(' | ')}`

      // Evita colisão usando hash MD5 único
      const idString = `${apenadoId}-${tipo}-${dataStr}-${descricao}`
      const hashId = createHash('md5').update(idString).digest('hex')

      await prisma.sipeHistorico.upsert({
        where: { id: hashId },
        create: {
          id: hashId,
          apenadoId,
          tipo,
          descricao,
          datahora,
          cela: celaPara,
          unidade: unidadePrisional || null,
        },
        update: {
          descricao,
          datahora,
          cela: celaPara,
          unidade: unidadePrisional || null,
        },
      })
    }
  } catch (err) {
    console.error(`Erro ao sincronizar histórico/mudança de cela do apenado ${sipeId}:`, err)
  }

  // 2. Coleta e salva o histórico de movimentações gerais da Ficha Geral
  try {
    const token = await page.evaluate(() => {
      return (window as any).CSRF_TOKEN || document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || ''
    })

    if (!token) {
      console.error(`Não foi possível obter CSRF Token para a Ficha Geral do apenado ${sipeId}`)
      return
    }

    const postResult = await page.evaluate(async ({ url, sipeId, token }) => {
      try {
        const bodyParams = new URLSearchParams()
        bodyParams.append('_token', token)
        bodyParams.append('apenado_id', String(sipeId))
        bodyParams.append('listar[]', 'DP') // Dados Pessoais (requerido)
        bodyParams.append('listar[]', 'M')  // Movimentações
        bodyParams.append('listar[]', 'A')  // Advogados
        bodyParams.append('listar[]', 'V')  // Visitas

        const res = await fetch(`${url}/relatorios/fichaGeral`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: bodyParams.toString()
        })

        if (!res.ok) {
          return { status: res.status, error: `HTTP ${res.status}` }
        }
        const text = await res.text()
        return { status: res.status, html: text }
      } catch (err: any) {
        return { status: 0, error: err.message }
      }
    }, { url: SIPE_URL, sipeId, token })

    if (postResult.error || postResult.status !== 200 || !postResult.html) {
      console.error(`Erro ao obter Ficha Geral via POST para o apenado ${sipeId}:`, postResult.error || `Status ${postResult.status}`)
      return
    }

    if (postResult.html.includes('PÁGINA PRINCIPAL') || postResult.html.includes('Oops!!')) {
      console.warn(`SIPE recusou filtros da Ficha Geral para o apenado ${sipeId} (redirecionou para a home)`)
      return
    }

    // Processa movimentações, advogados e visitantes da Ficha Geral
    await parseAndSaveFichaGeralCheerio(postResult.html, apenadoId)
  } catch (err) {
    console.error(`Erro ao sincronizar Ficha Geral do apenado ${sipeId}:`, err)
  }
}

function parseDateSafely(dateStr: string | null | undefined): Date | null {
  if (!dateStr) return null
  const cleanStr = dateStr.trim()
  if (!cleanStr) return null

  // 1. Formato brasileiro: DD/MM/YYYY (com ou sem HH:mm:ss)
  const brMatch = cleanStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/)
  if (brMatch) {
    const day = parseInt(brMatch[1], 10)
    const month = parseInt(brMatch[2], 10) - 1
    const year = parseInt(brMatch[3], 10)
    const hour = brMatch[4] ? parseInt(brMatch[4], 10) : 0
    const minute = brMatch[5] ? parseInt(brMatch[5], 10) : 0
    const second = brMatch[6] ? parseInt(brMatch[6], 10) : 0

    const date = new Date(year, month, day, hour, minute, second)
    if (!isNaN(date.getTime())) {
      return date
    }
  }

  // 2. Fallback: parser nativo do JS
  const parsed = new Date(cleanStr)
  if (!isNaN(parsed.getTime())) {
    return parsed
  }

  return null
}

async function scrapeDocumentos(
  page: Page,
  sipeId: number,
  apenadoId: string,
): Promise<void> {
  try {
    const path = `/anexos/${sipeId}/index`
    const proxyData = await fetchSipeViaProxy(path)
    if (proxyData && !proxyData.is_binary && proxyData.html) {
      await page.setContent(proxyData.html)
    } else {
      await gotoSipeWithFallback(page, path, { waitUntil: 'domcontentloaded' })
    }
    await page.waitForSelector('table, .empty-message, body', { timeout: 10_000 })


    const rows = await page.$$('table tbody tr')
    for (const row of rows) {
      const cells = await row.$$('td')
      if (cells.length < 1) continue

      const nome = (await cells[0]?.innerText())?.trim() || ''
      const tipo = (await cells[1]?.innerText())?.trim() || 'DOCUMENTO'
      const data = (await cells[2]?.innerText())?.trim()

      if (!nome) continue

      const urlDownload = await row.evaluate((el) => {
        const anchor = el.querySelector('a[href*="download"], a[href*="documento"], a[href*="arquivo"]') as HTMLAnchorElement | null;
        return anchor ? anchor.getAttribute('href') : null;
      });

      // Evita colisão e duplicações indesejadas usando hash MD5 único
      const idString = `${apenadoId}-${nome}-${data}`
      const hashId = createHash('md5').update(idString).digest('hex')

      const parsedDataAnexo = parseDateSafely(data)

      await prisma.sipeDocumento.upsert({
        where: { id: hashId },
        create: {
          id: hashId,
          apenadoId,
          nome,
          tipo,
          dataAnexo: parsedDataAnexo,
          urlDownload,
        },
        update: {
          tipo,
          dataAnexo: parsedDataAnexo,
          urlDownload,
        },
      })

      // Se for do tipo foto, baixa e vincula como foto complementar
      if (urlDownload && (tipo.toUpperCase() === 'FOTO' || nome.toUpperCase().includes('FOTO') || tipo.toUpperCase().includes('IMAGEM'))) {
        try {
          const apenadoImp = await prisma.sipeApenadoImportado.findUnique({
            where: { id: apenadoId },
            select: { apenadoLocalId: true }
          });
          await saveAndLinkComplementaryPhoto(page, urlDownload, apenadoId, apenadoImp?.apenadoLocalId || null, `Documento: ${nome}`);
        } catch (err) {
          console.error(`Erro ao salvar foto de documento:`, err);
        }
      }
    }
  } catch (err) {
    console.error(`Erro ao sincronizar documentos do apenado ${sipeId}:`, err)
  }
}

async function scrapeAdvogadosDoApenado(
  page: Page,
  sipeId: number,
  apenadoId: string
): Promise<void> {
  const rotasCandidatas = [
    `${SIPE_URL}/apenados/${sipeId}/advogados`,
    `${SIPE_URL}/apenados/${sipeId}/credenciamento`,
    `${SIPE_URL}/apenados/${sipeId}/atendimentos`,
    `${SIPE_URL}/apenados/${sipeId}/credenciados`,
  ]

  for (const url of rotasCandidatas) {
    try {
      const path = url.replace(SIPE_URL, '')
      const proxyData = await fetchSipeViaProxy(path)
      let status: number | undefined
      
      if (proxyData && !proxyData.is_binary && proxyData.html) {
        await page.setContent(proxyData.html)
        status = 200
      } else {
        await ensureFallbackLogin(page)
        const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 10_000 })
        status = response?.status()
      }
      
      if (status && (status === 404 || status === 403 || status === 500)) {
        continue
      }


      const bodyText = await page.innerText('body').catch(() => '')
      if (bodyText.includes('404') || bodyText.includes('não encontrado') || bodyText.includes('Não autorizado')) {
        continue
      }

      const linksAdvogados = await page.evaluate(() => {
        const anchors = Array.from(document.querySelectorAll('a'))
        return anchors
          .map((a) => {
            const href = a.getAttribute('href') || ''
            const text = (a.textContent ?? '').trim()
            return { href, text }
          })
          .filter((item) => {
            const hasAdvLink = item.href.includes('/advogados/') || item.href.includes('/detalhaclientes') || item.href.includes('/advogado/')
            return hasAdvLink && item.text.length > 3
          })
      })

      if (linksAdvogados.length === 0) {
        continue
      }

      for (const item of linksAdvogados) {
        const match = item.href.match(/\/advogados\/(\d+)/) || item.href.match(/\/advogado\/(\d+)/)
        if (!match) continue

        const advSipeId = parseInt(match[1])
        if (isNaN(advSipeId) || advSipeId <= 0) continue

        const nomeAdv = item.text.replace(/^(Dr\.|Dra\.|Dr|Dra|Advogado|Advogada)\s+/i, '').trim().toUpperCase()

        const adv = await prisma.sipeAdvogado.upsert({
          where: { sipeId: advSipeId },
          create: {
            sipeId: advSipeId,
            nome: nomeAdv || 'ADVOGADO IMPORTADO',
          },
          update: {
            nome: nomeAdv || undefined,
          },
        })

        await prisma.sipeVinculoAdvogado.upsert({
          where: {
            apenadoId_advogadoId: {
              apenadoId,
              advogadoId: adv.id,
            },
          },
          create: {
            apenadoId,
            advogadoId: adv.id,
            ativo: true,
          },
          update: {
            ativo: true,
          },
        })
      }

      break
    } catch {
      // continua tentando as próximas rotas candidatas
    }
  }
}

export async function closeBrowser(): Promise<void> {
  if (browserInstance) {
    await browserInstance.close()
    browserInstance = null
  }
}

// ── Funções de Aceleração com Cheerio (python-sdk-first) ──

function parseApenadoFichaHtmlCheerio(html: string) {
  const $ = cheerio.load(html)
  
  // Detecção de redirecionamento para o index / listagem
  const isListagem = $('table').length > 0 && $('[name="nomemae"]').length === 0 && $('[name="nomepai"]').length === 0
  if (isListagem) {
    return {
      dados: { nome: null } as any,
      imagesInfo: { mainSrc: null, allSrcs: [] }
    }
  }
  
  const val = (name: string) => $(`[name="${name}"]`).val()?.toString().trim() || null

  const selVal = (name: string) => {
    const select = $(`[name="${name}"]`)
    if (!select.length) return null
    const selectedOpt = select.find('option:selected')
    if (selectedOpt.length) {
      return selectedOpt.text().trim() || null
    }
    const valAttr = select.val()
    if (valAttr) {
      const opt = select.find(`option[value="${valAttr}"]`)
      if (opt.length) return opt.text().trim() || null
    }
    return select.find('option').first().text().trim() || null
  }

  // Clona ou remove elementos de layout do cabeçalho superior e lateral do SIPE para não ler o nome da unidade ativa da sessão no menu do usuário
  const $clean = cheerio.load(html)
  $clean('header, nav, .main-header, .navbar, .main-sidebar, aside, .sidebar, .user-panel, .dropdown-menu, #navbar, .header').remove()
  const bodyText = $clean('body').text() || ''

  let celaFicha = null
  const celaMatch = bodyText.match(/Cela:\s*([^\n]+)/i) || bodyText.match(/Cela\s*-\s*([^\n]+)/i)
  if (celaMatch) {
    celaFicha = celaMatch[1].trim()
  }

  let unidadeFicha = selVal('unidade_id') || selVal('fk_unidade') || selVal('estabelecimento') || selVal('unidade') || selVal('estabelecimento_id')
  if (!unidadeFicha) {
    const unidadeMatch = bodyText.match(/Unidade:\s*([^\n]+)/i) || bodyText.match(/Estabelecimento:\s*([^\n]+)/i) || bodyText.match(/Unidade\s*Prisional:\s*([^\n]+)/i)
    if (unidadeMatch) {
      unidadeFicha = unidadeMatch[1].trim()
    }
  }

  const extractLabel = (label: string): string | null => {
    let match = bodyText.match(new RegExp(`${label}\\s*:?\\s*([^\\n]+)`, 'i'))
    if (match) {
      const value = match[1].trim()
      if (value && value.length > 0 && !value.match(/^[\s•\-–—]+$/)) {
        return value
      }
    }
    match = bodyText.match(new RegExp(`${label}\\s*[\\n\\r]+\\s*([^\\n]+)`, 'i'))
    if (match) {
      const value = match[1].trim()
      if (value && value.length > 0 && !value.match(/^[\s•\-–—]+$/)) {
        return value
      }
    }
    return null
  }

  const sexoValue = selVal('sexo') || extractLabel('Sexo') || extractLabel('Sexo:') || extractLabel('Gênero')
  const etniaValue = selVal('fk_etnia') || extractLabel('Etnia')
  const estadoCivilValue = selVal('fk_estadocivil') || extractLabel('Estado Civil')
  const grauInstrucaoValue = selVal('fk_grauinstrucao') || extractLabel('Grau de Instrução') || extractLabel('Grau Instrução') || extractLabel('Instrução')
  const religiaoValue = selVal('fk_religiao') || extractLabel('Religião')
  const situacaoValue = selVal('situacao') || extractLabel('Situação') || extractLabel('Situação:') || extractLabel('Status')

  const imgs: { src: string; alt: string; id: string; className: string }[] = []
  $('img').each((_, img) => {
    imgs.push({
      src: $(img).attr('src') || '',
      alt: $(img).attr('alt') || '',
      id: $(img).attr('id') || '',
      className: $(img).attr('class') || '',
    })
  })

  let mainSrc: string | null = null
  const allSrcs: string[] = []

  for (const img of imgs) {
    const src = img.src
    const alt = img.alt.toLowerCase()
    const id = img.id.toLowerCase()
    const className = img.className.toLowerCase()
    
    if (
      !mainSrc && (
        id.includes('foto') || id.includes('profile') || id.includes('avatar') || id.includes('apenado') ||
        className.includes('foto') || className.includes('profile') || className.includes('avatar') || className.includes('apenado') ||
        alt.includes('foto') || alt.includes('profile') || alt.includes('avatar') || alt.includes('apenado') ||
        src.includes('/foto') || src.includes('/photo') || src.includes('/imagem') || src.includes('/getFoto') || src.includes('/arquivo')
      )
    ) {
      mainSrc = src
    } else {
      allSrcs.push(src)
    }
  }

  const containerImg = $('.foto img, .foto-apenado img, .profile-image img, #foto img').first()
  if (containerImg.length) {
    mainSrc = containerImg.attr('src') || mainSrc
  }

  if (!mainSrc && imgs.length > 0) {
    const candidates = imgs.filter(img => {
      const src = img.src.toLowerCase()
      return !src.includes('logo') && !src.includes('sejus') && !src.includes('governo') && !src.includes('brasao') && !src.includes('bandeira') && !src.includes('icon')
    })
    if (candidates.length > 0) {
      mainSrc = candidates[0].src
    }
  }

  return {
    dados: {
      nome: val('nomeapenado'),
      nomeOutro: val('nomefalso'),
      cpf: val('cpf'),
      rg: val('rg'),
      rgOrgao: val('orgaoexpedidor'),
      dataNascimento: val('datanascimento'),
      naturalidade: val('distrito'),
      sexo: sexoValue,
      etnia: etniaValue,
      orientacaoSexual: selVal('homosexual') || extractLabel('Orientação\\s+Sexual'),
      tipoSanguineo: selVal('tiposanguineo') || extractLabel('Tipo\\s+(?:de\\s+)?Sanguíneo'),
      grauInstrucao: grauInstrucaoValue,
      religiao: religiaoValue,
      estadoCivil: estadoCivilValue,
      nomeConjuge: val('nomeesposa'),
      qtdFilhos: parseInt(val('qtdfilhos') || '0') || null,
      nomeMae: val('nomemae'),
      nomePai: val('nomepai'),
      telefone: val('telefone'),
      rji: val('rji'),
      regime: val('regime'),
      situacao: situacaoValue,
      dataEntrada: val('dataentrada'),
      dataPrisao: val('dataprisao'),
      tempoPena: val('tempodepena'),
      oficioEntrada: val('oficioentrada'),
      presoOriundo: selVal('presooriundo'),
      monitorado: val('monitorado') === 'SIM',
      intramuro: val('intramuro') === 'SIM',
      faccaoSipeId: parseInt($('[name="faccao_id"]').val()?.toString() || '0') || null,
      celaFicha,
      unidadeFicha,
    },
    imagesInfo: { mainSrc, allSrcs }
  }
}

async function parseAndSaveAlcunhasCheerio(html: string, apenadoId: string): Promise<void> {
  const $ = cheerio.load(html)
  const rows = $('table tbody tr')
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const cells = $(row).find('td')
    if (cells.length < 2) continue
    const alcunha = $(cells[1]).text().trim()
    if (!alcunha) continue
    const exists = await prisma.sipeAlcunha.findFirst({
      where: { apenadoId, alcunha },
    })
    if (!exists) {
      await prisma.sipeAlcunha.create({ data: { apenadoId, alcunha } })
    }
  }
}

async function parseAndSaveProcessosCheerio(html: string, apenadoId: string): Promise<void> {
  const $ = cheerio.load(html)
  const tabelas = $('table')
  
  for (let t = 0; t < tabelas.length; t++) {
    const table = tabelas[t]
    const rows = $(table).find('tbody tr')
    if (rows.length === 0) continue

    const headers: string[] = []
    $(table).find('thead th, thead td').each((_, h) => {
      headers.push($(h).text().toUpperCase().trim())
    })

    const numIdx = headers.findIndex(h => h.includes('NÚMERO') || h.includes('PROCESSO') || h.includes('NUMERO'))
    const varaIdx = headers.findIndex(h => h.includes('VARA') || h.includes('JUÍZO') || h.includes('JUIZO'))
    const artIdx = headers.findIndex(h => h.includes('ARTIGO') || h.includes('INFRAÇÃO') || h.includes('INFRACAO') || h.includes('CAPITULAÇÃO') || h.includes('CAPITULACAO'))
    const penaIdx = headers.findIndex(h => h.includes('PENA') || h.includes('TEMPO'))
    const princIdx = headers.findIndex(h => h.includes('PRINCIPAL'))

    for (let r = 0; r < rows.length; r++) {
      const row = rows[r]
      const cells = $(row).find('td')
      if (cells.length < 2) continue

      let sipeProcessoId: number | null = null
      $(row).find('a, button').each((_, el) => {
        if (sipeProcessoId) return
        const href = $(el).attr('href') || ''
        const onClickText = $(el).attr('onclick') || ''
        const actionText = href + ' ' + onClickText
        const match = actionText.match(/\/processos\/(\d+)/) || 
                      actionText.match(/processo_id[^\d]*(\d+)/) || 
                      actionText.match(/\/excluirProcesso\/(\d+)/) || 
                      actionText.match(/\/excluir\/(\d+)/)
        if (match) {
          sipeProcessoId = parseInt(match[1])
        }
      })

      let numero: string | null = null
      if (numIdx >= 0 && cells.get(numIdx)) {
        numero = $(cells.get(numIdx)).text().trim()
      } else {
        numero = $(cells.get(0)).text().trim()
      }

      if (numero) {
        numero = numero.replace(/\s+/g, ' ').trim()
      }

      let vara: string | null = null
      if (varaIdx >= 0 && cells.get(varaIdx)) {
        vara = $(cells.get(varaIdx)).text().trim()
      }

      let artigos: string[] = []
      if (artIdx >= 0 && cells.get(artIdx)) {
        const rawArt = $(cells.get(artIdx)).text().trim()
        artigos = rawArt.split(/[,;\n]/).map(a => a.trim()).filter(Boolean)
      }

      let tempoPena: string | null = null
      if (penaIdx >= 0 && cells.get(penaIdx)) {
        tempoPena = $(cells.get(penaIdx)).text().trim()
      }

      let principal = false
      if (princIdx >= 0 && cells.get(princIdx)) {
        const checkbox = $(cells.get(princIdx)).find('input[type="checkbox"], input[type="radio"]')
        if (checkbox.length) {
          principal = !!checkbox.prop('checked') || checkbox.attr('checked') !== undefined
        } else {
          const text = $(cells.get(princIdx)).text().toUpperCase()
          principal = text.includes('SIM') || text.includes('PRINCIPAL') || text.includes('ATIVO')
        }
      }

      const procId = sipeProcessoId ?? Math.abs(hashCodeLocal(numero || ''))

      await prisma.sipeProcesso.upsert({
        where: { id: `${apenadoId}_${procId}` },
        create: {
          id: `${apenadoId}_${procId}`,
          apenadoId,
          sipeProcessoId,
          numero,
          vara,
          artigos,
          tempoPena,
          principal
        },
        update: {
          numero,
          vara,
          artigos,
          tempoPena,
          principal
        }
      })
    }
  }
}

async function parseAndSaveEnderecoCheerio(html: string, apenadoId: string): Promise<boolean> {
  const $ = cheerio.load(html)
  
  const viewRow = $('tr[id^="view_"]').first()
  let logradouro: string | null = null
  let numero: string | null = null
  let complemento: string | null = null
  let bairro: string | null = null
  let cidade: string | null = null
  let uf: string | null = null
  let cep: string | null = null
  let existe = false

  if (!viewRow.length) {
    logradouro = $('[name="rua_endereco"]').val()?.toString().trim() || null
    numero = $('[name="numero_endereco"]').val()?.toString().trim() || null
    complemento = $('[name="complemento_endereco"]').val()?.toString().trim() || null
    bairro = $('[name="bairro_endereco"]').val()?.toString().trim() || null

    const estEl = $('[name="estado_id"]')
    if (estEl.length) {
      uf = estEl.find('option:selected').text().trim() || null
    }

    const cidEl = $('[name="cidade_id"]')
    if (cidEl.length) {
      cidade = cidEl.find('option:selected').text().trim() || null
    }

    cep = $('[name="cep_endereco"]').val()?.toString().trim() || 
          $('[name="cep"]').val()?.toString().trim() || null
          
    existe = !!(logradouro || bairro || cidade)
  } else {
    const cells = viewRow.find('td')
    const addrId = viewRow.attr('id')?.match(/\d+/)?.[0] || ''

    logradouro = $(`#view_rua_endereco${addrId}`).text().trim() || null
    numero = $(`#view_numero_endereco${addrId}`).text().trim() || null
    complemento = $(`#view_complemento_endereco${addrId}`).text().trim() || null
    bairro = $(`#view_bairro_endereco${addrId}`).text().trim() || null

    const cidadeEstado = $(cells.get(5)).text().trim() || ''
    if (cidadeEstado && cidadeEstado.includes('-')) {
      const parts = cidadeEstado.split('-')
      cidade = parts[0].trim()
      uf = parts[1].trim()
    } else if (cidadeEstado) {
      cidade = cidadeEstado
    }

    cep = $('[name="cep_endereco"]').val()?.toString().trim() || null
    existe = true
  }

  const hasForm = $('form#formulario').length > 0 || $('table').length > 0
  if (!existe && !hasForm) {
    return false
  }

  const ufLimpa = uf && !uf.includes('Selecione') && !uf.includes('Escolha') ? uf : null
  const cidadeLimpa = cidade && !cidade.includes('Selecione') && !cidade.includes('Escolha') ? cidade : null

  await prisma.sipeApenadoImportado.update({
    where: { id: apenadoId },
    data: {
      logradouro,
      numero,
      complemento,
      bairro,
      cidade: cidadeLimpa,
      uf: ufLimpa,
      cep
    }
  })

  return true
}

async function parseAndSaveMudarCelaCheerio(html: string, apenadoId: string): Promise<void> {
  const $ = cheerio.load(html)
  const table = $('table').first()
  if (!table.length) return

  // Obtém a unidade prisional do formulário de dados no topo da página
  const unidadeForm = $('input[name="unidade"]').val()?.toString().trim() || ''

  // Detecção dinâmica das colunas
  let unidadeIndex = -1
  let dataIndex = -1
  let celaDeIndex = -1
  let celaParaIndex = -1
  let motivoIndex = -1

  table.find('thead tr th, thead tr td, tr:first-child th, tr:first-child td').each((idx, el) => {
    const text = $(el).text().toUpperCase().trim()
    if (text.includes('UNIDADE') || text.includes('ESTABELECIMENTO')) unidadeIndex = idx
    if (text.includes('DATA')) {
      if (!text.includes('CELA') && !text.includes('MOTIVO')) dataIndex = idx
    }
    if (text.includes('CELA DE') || text.includes('CELA ORIGEM') || (text.includes('CELA') && text.includes('DE'))) celaDeIndex = idx
    if (text.includes('CELA PARA') || text.includes('CELA DESTINO') || (text.includes('CELA') && text.includes('PARA'))) celaParaIndex = idx
    if (text.includes('MOTIVO')) motivoIndex = idx
  })

  // Fallback padrão se não conseguir detectar pelo cabeçalho
  if (dataIndex === -1) {
    unidadeIndex = 0
    dataIndex = 1
    celaDeIndex = 2
    celaParaIndex = 3
    motivoIndex = 4
  }

  const rows = table.find('tbody tr')
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const cells = $(row).find('td')
    if (cells.length < 5) continue

    let unidadePrisional = unidadeIndex >= 0 && cells.length > unidadeIndex ? $(cells.get(unidadeIndex)).text().trim() : ''
    if (!unidadePrisional && unidadeForm) {
      unidadePrisional = unidadeForm
    }
    const dataStr = dataIndex >= 0 && cells.length > dataIndex ? $(cells.get(dataIndex)).text().trim() : ''
    const motivo = motivoIndex >= 0 && cells.length > motivoIndex ? $(cells.get(motivoIndex)).text().trim() : ''
    const celaDe = celaDeIndex >= 0 && cells.length > celaDeIndex ? $(cells.get(celaDeIndex)).text().trim() : ''
    const celaPara = celaParaIndex >= 0 && cells.length > celaParaIndex ? $(cells.get(celaParaIndex)).text().trim() : ''

    if (!dataStr) continue

    let datahora: Date | null = null
    try {
      const parts = dataStr.split(' ')
      const dateParts = parts[0].split('/')
      if (dateParts.length === 3) {
        const timeParts = parts[1] ? parts[1].split(':') : ['00', '00']
        datahora = new Date(
          parseInt(dateParts[2]),
          parseInt(dateParts[1]) - 1,
          parseInt(dateParts[0]),
          parseInt(timeParts[0] || '00'),
          parseInt(timeParts[1] || '00')
        )
      }
    } catch {
      datahora = new Date(dataStr)
    }

    const tipo = 'TRANSFERENCIA'
    const partsDesc = []
    if (unidadePrisional) partsDesc.push(`Unidade: ${unidadePrisional}`)
    partsDesc.push(`De: ${celaDe}`)
    partsDesc.push(`Para: ${celaPara}`)
    if (motivo) partsDesc.push(`Motivo: ${motivo}`)
    const descricao = `Mudança de cela. ${partsDesc.join(' | ')}`

    const idString = `${apenadoId}-${tipo}-${dataStr}-${descricao}`
    const hashId = createHash('md5').update(idString).digest('hex')

    await prisma.sipeHistorico.upsert({
      where: { id: hashId },
      create: {
        id: hashId,
        apenadoId,
        tipo,
        descricao,
        datahora,
        cela: celaPara,
        unidade: unidadePrisional || null,
      },
      update: {
        descricao,
        datahora,
        cela: celaPara,
        unidade: unidadePrisional || null,
      },
    })
  }
}

function generateFakeSipeId(nome: string, oab?: string | null): number {
  const seed = oab ? `${nome}-${oab}` : nome
  let hash = 0
  for (let i = 0; i < seed.length; i++) {
    const character = seed.charCodeAt(i)
    hash = ((hash << 5) - hash) + character
    hash = hash & hash // Converte para inteiro de 32 bits
  }
  return -Math.abs(hash)
}

async function parseAndSaveFichaGeralCheerio(html: string, apenadoId: string): Promise<void> {
  const $ = cheerio.load(html)
  const table = $('table').first()

  if (table.length) {
  const rows = table.find('tbody tr, tr')
  for (let i = 0; i < rows.length; i++) {
    const tr = rows[i]
    const cells = $(tr).find('td, th')
    if (cells.length < 9) continue

    const codigo = $(cells.get(0)).text().trim()
    if (!codigo || codigo === 'Codigo' || codigo === 'Código') continue

    const regime = $(cells.get(1)).text().trim()
    const intramuro = $(cells.get(2)).text().trim()
    const monitorado = $(cells.get(3)).text().trim()
    const dataEntrada = $(cells.get(4)).text().trim()
    const origem = $(cells.get(5)).text().trim()
    const dataSaida = $(cells.get(6)).text().trim()
    const destino = $(cells.get(7)).text().trim()
    const motivo = $(cells.get(8)).text().trim()

    const dataStr = dataEntrada !== '-----' ? dataEntrada : (dataSaida !== '-----' ? dataSaida : null)
    let datahora: Date | null = null

    if (dataStr) {
      try {
        const dateParts = dataStr.split('/')
        if (dateParts.length === 3) {
          datahora = new Date(
            parseInt(dateParts[2]),
            parseInt(dateParts[1]) - 1,
            parseInt(dateParts[0]),
            12,
            0
          )
        }
      } catch {
        datahora = new Date(dataStr)
      }
    }

    const tipo = 'MOVIMENTACAO'
    const descricao = `Movimentação Geral - Código: ${codigo} | Motivo: ${motivo} | Origem: ${origem} | Destino: ${destino} | Entrada: ${dataEntrada} | Saída: ${dataSaida} | Regime: ${regime} | Intramuro: ${intramuro} | Monitorado: ${monitorado}`

    const idString = `sipe-mov-${apenadoId}-${codigo}`
    const hashId = createHash('md5').update(idString).digest('hex')

    await prisma.sipeHistorico.upsert({
      where: { id: hashId },
      create: {
        id: hashId,
        apenadoId,
        tipo,
        descricao,
        datahora,
        unidade: destino !== '-----' ? destino : (origem !== '-----' ? origem : null),
      },
      update: {
        descricao,
        datahora,
        unidade: destino !== '-----' ? destino : (origem !== '-----' ? origem : null),
      },
    })
  }
  }

  // --- Extração de Advogados da Ficha Geral consolidada ---
  const titleAdv = $('div.title').filter((_, elem) => $(elem).text().toUpperCase().includes('ADVOGADOS CADASTRADOS'))
  if (titleAdv.length) {
    let next = titleAdv.next()
    while (next.length && next.hasClass('line')) {
      const line = next
      const photoSrc = line.find('img').attr('src') || null
      const fields: Record<string, string> = {}

      line.find('.input').each((_, inputElem) => {
        const label = $(inputElem).find('label').text().trim().toUpperCase()
        const value = $(inputElem).find('input').val()?.toString().trim() || $(inputElem).find('input').attr('value')?.trim() || ''
        if (label) {
          fields[label] = value
        }
      })

      const nomeAdv = (fields['NOME DO ADVOGADO'] || fields['NOME'] || '').trim().toUpperCase()
      const oab = normalizeOAB((fields['OAB'] || '').trim())
      const situacao = (fields['SITUAÇÃO'] || fields['SITUACAO'] || '').trim()
      const telefone = (fields['TELEFONE DE CONTATO'] || '').trim()
      const dataCadastro = (fields['DATA DE CADASTRO'] || '').trim()

      if (nomeAdv && nomeAdv.length > 2) {
        let photoPath: string | null = null
        if (photoSrc && !photoSrc.includes('Undefined offset') && !photoSrc.includes('loading.gif')) {
          try {
            const cleanPhotoSrc = photoSrc.replace(/_fotoUsuario/i, '')
            const photoPathRelative = cleanPhotoSrc.replace(SIPE_URL, '')
            let proxyPhoto = await fetchSipeViaProxy(photoPathRelative)
            if (!proxyPhoto && cleanPhotoSrc !== photoSrc) {
              proxyPhoto = await fetchSipeViaProxy(photoSrc.replace(SIPE_URL, ''))
            }
            if (proxyPhoto && proxyPhoto.is_binary && proxyPhoto.data) {
              const base64Data = proxyPhoto.data
              if (base64Data.includes(',')) {
                const base64Content = base64Data.split(',')[1]
                const imageBuffer = Buffer.from(base64Content, 'base64')
                const webpBuffer = await sharp(imageBuffer)
                  .resize(600, 600, { fit: 'inside', withoutEnlargement: true })
                  .webp({ quality: 85 })
                  .toBuffer()

                const baseDir = process.env.UPLOAD_DIR || join(process.cwd(), 'uploads')
                const advDir = join(baseDir, 'advogados')
                const { mkdir, writeFile } = await import('fs/promises')
                await mkdir(advDir, { recursive: true })

                const fileKey = oab ? oab.replace(/[^a-zA-Z0-9-]/g, '_') : Math.abs(hashCodeLocal(nomeAdv))
                const filename = `advogado-${fileKey}.webp`
                const localPath = join(advDir, filename)
                await writeFile(localPath, webpBuffer)
                photoPath = `uploads/advogados/${filename}`
              }
            }
          } catch (imgErr) {
            console.error(`Erro ao baixar foto do advogado ${nomeAdv} na Ficha Geral:`, imgErr)
          }
        }

        let adv = await prisma.sipeAdvogado.findFirst({
          where: {
            OR: [
              { nome: nomeAdv },
              oab ? { oab } : null
            ].filter(Boolean) as any
          }
        })

        const upsertData = {
          nome: nomeAdv,
          oab: oab || null,
          telefone: telefone || null,
          dataCadastro: dataCadastro || null,
          ...(photoPath ? { photoPath } : {})
        }

        if (adv) {
          adv = await prisma.sipeAdvogado.update({
            where: { id: adv.id },
            data: upsertData
          })
        } else {
          const fakeSipeId = generateFakeSipeId(nomeAdv, oab)
          adv = await prisma.sipeAdvogado.create({
            data: {
              sipeId: fakeSipeId,
              ...upsertData
            }
          })
        }

        const isAtivo = situacao.toUpperCase() === 'ATIVO' || situacao === ''
        await prisma.sipeVinculoAdvogado.upsert({
          where: {
            apenadoId_advogadoId: {
              apenadoId,
              advogadoId: adv.id
            }
          },
          create: {
            apenadoId,
            advogadoId: adv.id,
            ativo: isAtivo
          },
          update: {
            ativo: isAtivo
          }
        })
      }

      next = next.next()
    }
  }

  // --- Extração de Visitantes da Ficha Geral consolidada ---
  const titleVis = $('div.title').filter((_, elem) => {
    const t = $(elem).text().toUpperCase()
    return t.includes('VISITANTES CADASTRADAS') || t.includes('VISITANTES CADASTRADOS')
  })
  if (titleVis.length) {
    let next = titleVis.next()
    while (next.length && next.hasClass('line')) {
      const line = next
      const photoSrc = line.find('img').attr('src') || null
      const fields: Record<string, string> = {}

      line.find('.input').each((_, inputElem) => {
        const label = $(inputElem).find('label').text().trim().toUpperCase()
        const value = $(inputElem).find('input').val()?.toString().trim() || $(inputElem).find('input').attr('value')?.trim() || ''
        if (label) {
          fields[label] = value
        }
      })

      const labelNome = Object.keys(fields).find(k => k.includes('NOME')) || 'NOME DA VISITANTE'
      const labelParentesco = Object.keys(fields).find(k => k.includes('PARENTESCO') || k.includes('VINCULO')) || 'GRAU PARENTESCO'
      const labelSituacao = Object.keys(fields).find(k => k.includes('SITUAÇÃO') || k.includes('SITUACAO')) || 'SITUAÇÃO'

      const nomeVis = (fields[labelNome] || '').trim().toUpperCase()
      const cpf = normalizeCPF(fields['CPF'] || '')
      const parentesco = (fields[labelParentesco] || '').trim()
      const situacao = (fields[labelSituacao] || '').trim()

      if (nomeVis && nomeVis.length > 2) {
        let photoPath: string | null = null
        if (photoSrc && !photoSrc.includes('Undefined offset') && !photoSrc.includes('loading.gif')) {
          try {
            const cleanPhotoSrc = photoSrc.replace(/_fotoUsuario/i, '')
            const photoPathRelative = cleanPhotoSrc.replace(SIPE_URL, '')
            let proxyPhoto = await fetchSipeViaProxy(photoPathRelative)
            if (!proxyPhoto && cleanPhotoSrc !== photoSrc) {
              proxyPhoto = await fetchSipeViaProxy(photoSrc.replace(SIPE_URL, ''))
            }
            if (proxyPhoto && proxyPhoto.is_binary && proxyPhoto.data) {
              const base64Data = proxyPhoto.data
              if (base64Data.includes(',')) {
                const base64Content = base64Data.split(',')[1]
                const imageBuffer = Buffer.from(base64Content, 'base64')
                const webpBuffer = await sharp(imageBuffer)
                  .resize(600, 600, { fit: 'inside', withoutEnlargement: true })
                  .webp({ quality: 85 })
                  .toBuffer()

                const baseDir = process.env.UPLOAD_DIR || join(process.cwd(), 'uploads')
                const visitDir = join(baseDir, 'visitantes')
                const { mkdir, writeFile } = await import('fs/promises')
                await mkdir(visitDir, { recursive: true })

                const fileKey = cpf || Math.abs(hashCodeLocal(nomeVis))
                const filename = `visitante-${fileKey}.webp`
                const localPath = join(visitDir, filename)
                await writeFile(localPath, webpBuffer)
                photoPath = `uploads/visitantes/${filename}`
              }
            }
          } catch (imgErr) {
            console.error(`Erro ao baixar foto do visitante ${nomeVis} na Ficha Geral:`, imgErr)
          }
        }

        let vis = null
        if (cpf) {
          vis = await prisma.sipeVisitante.findFirst({ where: { cpf } })
        }
        if (!vis) {
          vis = await prisma.sipeVisitante.findFirst({ where: { nome: nomeVis } })
        }

        const upsertData = {
          nome: nomeVis,
          cpf: cpf && cpf.length === 11 ? cpf : null,
          parentesco: parentesco || null,
          ...(photoPath ? { photoPath } : {})
        }

        if (vis) {
          vis = await prisma.sipeVisitante.update({
            where: { id: vis.id },
            data: upsertData
          })
        } else {
          vis = await prisma.sipeVisitante.create({
            data: upsertData
          })
        }

        const isAtivo = situacao.toUpperCase() === 'ATIVO' || situacao === ''
        await prisma.sipeVinculoVisitante.upsert({
          where: {
            apenadoId_visitanteId: {
              apenadoId,
              visitanteId: vis.id
            }
          },
          create: {
            apenadoId,
            visitanteId: vis.id,
            ativo: isAtivo
          },
          update: {
            ativo: isAtivo
          }
        })
      }

      next = next.next()
    }
  }
}

async function parseAndSaveDocumentosCheerio(html: string, apenadoId: string, apenadoLocalId: string | null): Promise<void> {
  const $ = cheerio.load(html)
  const rows = $('table tbody tr')
  
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const cells = $(row).find('td')
    if (cells.length < 1) continue

    const nome = $(cells.get(0)).text().trim() || ''
    const tipo = $(cells.get(1)).text().trim() || 'DOCUMENTO'
    const data = $(cells.get(2)).text().trim()

    if (!nome) continue

    const anchor = $(row).find('a[href*="download"], a[href*="documento"], a[href*="arquivo"]')
    const urlDownload = anchor.length ? anchor.attr('href') || null : null

    const idString = `${apenadoId}-${nome}-${data}`
    const hashId = createHash('md5').update(idString).digest('hex')

    const parsedDataAnexo = parseDateSafely(data)

    await prisma.sipeDocumento.upsert({
      where: { id: hashId },
      create: {
        id: hashId,
        apenadoId,
        nome,
        tipo,
        dataAnexo: parsedDataAnexo,
        urlDownload,
      },
      update: {
        tipo,
        dataAnexo: parsedDataAnexo,
        urlDownload,
      },
    })

    if (urlDownload && (tipo.toUpperCase() === 'FOTO' || nome.toUpperCase().includes('FOTO') || tipo.toUpperCase().includes('IMAGEM'))) {
      try {
        const cleanPhotoSrc = urlDownload.replace(/_fotoUsuario/i, '')
        const photoPathRelative = cleanPhotoSrc.replace(SIPE_URL, '')
        const proxyPhoto = await fetchSipeViaProxy(photoPathRelative)
        
        if (proxyPhoto && proxyPhoto.is_binary && proxyPhoto.data) {
          const base64Data = proxyPhoto.data
          if (base64Data.includes(',')) {
            const base64Content = base64Data.split(',')[1]
            const imageBuffer = Buffer.from(base64Content, 'base64')
            const webpBuffer = await sharp(imageBuffer)
              .resize(800, 800, { fit: 'inside', withoutEnlargement: true })
              .webp({ quality: 90 })
              .toBuffer()

            const dir = getApenadosDir()
            const { mkdir, writeFile } = await import('fs/promises')
            await mkdir(dir, { recursive: true })
            
            const fileHash = createHash('md5').update(urlDownload).digest('hex')
            const filename = `sipe-comp-${apenadoId}-${fileHash}.webp`
            const localPath = join(dir, filename)

            await writeFile(localPath, webpBuffer)
            const photoPath = `uploads/apenados/${filename}`

            const desc = `Documento: ${nome}`
            const exists = await prisma.sipeFotoComplementar.findFirst({
              where: { apenadoImportadoId: apenadoId, photoPath }
            })

            if (!exists) {
              await prisma.sipeFotoComplementar.create({
                data: {
                  apenadoImportadoId: apenadoId,
                  photoPath,
                  descricao: desc,
                  apenadoLocalId: apenadoLocalId || undefined
                }
              })
            }
          }
        }
      } catch (err) {
        console.error(`Erro ao salvar foto de documento no Cheerio:`, err)
      }
    }
  }
}

async function parseAndSaveVisitantesCheerio(html: string, apenadoId: string): Promise<void> {
  const $ = cheerio.load(html)
  const tabelas = $('table')
  if (!tabelas.length) return

  const list: Array<{
    visitaId: string | null
    nome: string
    cpf: string | null
    parentesco: string | null
    photoSrc: string | null
    ativo: boolean
  }> = []

  tabelas.each((tableIdx, table) => {
    const rows = $(table).find('tbody tr')
    if (rows.length === 0) return

    const headers: string[] = []
    $(table).find('thead th, thead td').each((_, h) => {
      headers.push($(h).text().toUpperCase().trim())
    })

    const nomeIdx = headers.findIndex(h => h.includes('NOME') || h.includes('VISITANTE') || h.includes('CREDENCIADO'))
    const cpfIdx = headers.findIndex(h => h.includes('CPF'))
    const parenIdx = headers.findIndex(h => h.includes('PARENTESCO') || h.includes('VÍNCULO') || h.includes('VINCULO') || h.includes('GRAU'))
    const isTableAtivo = tableIdx === 0

    rows.each((_, row) => {
      const cells = $(row).find('td')
      if (cells.length < 2) return

      const img = $(row).find('img')
      const photoSrc = img.length ? img.attr('src') || null : null

      let visitaId: string | null = null
      const firstCell = cells.get(0)
      if (firstCell) {
        visitaId = $(firstCell).attr('data-id') || $(firstCell).text().trim() || null
      }

      let nome = ''
      if (nomeIdx >= 0 && cells.get(nomeIdx)) {
        nome = $(cells.get(nomeIdx)).text().trim()
      } else {
        const firstColHasImg = $(cells.get(0)).find('img').length > 0
        nome = $(cells.get(firstColHasImg ? 1 : 0)).text().trim()
      }

      if (!nome || nome.toUpperCase().includes('NENHUM') || nome.toUpperCase().includes('REGISTRO') || nome.length < 3) {
        return
      }

      let cpf: string | null = null
      if (cpfIdx >= 0 && cells.get(cpfIdx)) {
        cpf = $(cells.get(cpfIdx)).text().replace(/\D/g, '')
      } else {
        const rowText = $(row).text() || ''
        const cpfMatch = rowText.match(/\d{3}\.\d{3}\.\d{3}-\d{2}/)
        if (cpfMatch) {
          cpf = cpfMatch[0].replace(/\D/g, '')
        }
      }

      let parentesco: string | null = null
      if (parenIdx >= 0 && cells.get(parenIdx)) {
        parentesco = $(cells.get(parenIdx)).text().trim()
      }

      list.push({
        visitaId,
        nome,
        cpf: normalizeCPF(cpf),
        parentesco,
        photoSrc,
        ativo: isTableAtivo
      })
    })
  })

  const visitorDetailsPromises = list.map(async (v) => {
    let photoSrc = v.photoSrc
    let cpf = v.cpf

    if (!photoSrc && v.visitaId) {
      try {
        const subPath = `/visitas/entrada/mostra/${v.visitaId}`
        const subData = await fetchSipeViaProxy(subPath)
        if (subData && !subData.is_binary && subData.html) {
          const $sub = cheerio.load(subData.html)
          
          const rows = $sub('.profile-info-row')
          rows.each((_, r) => {
            const nameText = $sub(r).find('.profile-info-name').text().trim() || ''
            if (nameText.toLowerCase().includes('cpf')) {
              cpf = normalizeCPF($sub(r).find('.profile-info-value').text()) || cpf
            }
          })

          const imgs = $sub('img')
          let pSrc: string | null = null
          
          imgs.each((_, img) => {
            if (pSrc) return
            const src = $sub(img).attr('src') || ''
            if (src.includes('/public/fotosVisitas/')) {
              pSrc = src
            }
          })

          if (!pSrc) {
            const profileImg = $sub('.profile-picture img')
            if (profileImg.length) {
              const src = profileImg.attr('src') || ''
              if (!src.includes('loading.gif')) {
                pSrc = src
              }
            }
          }

          if (!pSrc) {
            imgs.each((_, img) => {
              if (pSrc) return
              const src = $sub(img).attr('src') || ''
              const s = src.toLowerCase()
              if (!s.includes('loading.gif') && !s.includes('logo') && !s.includes('sejus') && !s.includes('governo') && !s.includes('brasao')) {
                pSrc = src
              }
            })
          }

          if (pSrc) photoSrc = pSrc
        }
      } catch (subErr) {
        console.error(`Erro subpágina de visitante ${v.nome}:`, subErr)
      }
    }

    let photoPath: string | null = null
    if (photoSrc) {
      try {
        const cleanPhotoSrc = photoSrc.replace(/_fotoUsuario/i, '')
        const photoPathRelative = cleanPhotoSrc.replace(SIPE_URL, '')
        let proxyPhoto = await fetchSipeViaProxy(photoPathRelative)
        
        if (!proxyPhoto && cleanPhotoSrc !== photoSrc) {
          const fallbackPathRelative = photoSrc.replace(SIPE_URL, '')
          proxyPhoto = await fetchSipeViaProxy(fallbackPathRelative)
        }

        if (proxyPhoto && proxyPhoto.is_binary && proxyPhoto.data) {
          const base64Data = proxyPhoto.data
          if (base64Data.includes(',')) {
            const base64Content = base64Data.split(',')[1]
            const imageBuffer = Buffer.from(base64Content, 'base64')
            const webpBuffer = await sharp(imageBuffer)
              .resize(600, 600, { fit: 'inside', withoutEnlargement: true })
              .webp({ quality: 85 })
              .toBuffer()

            const baseDir = process.env.UPLOAD_DIR || join(process.cwd(), 'uploads')
            const visitDir = join(baseDir, 'visitantes')
            const { mkdir, writeFile } = await import('fs/promises')
            await mkdir(visitDir, { recursive: true })

            const fileKey = cpf || Math.abs(hashCodeLocal(v.nome))
            const filename = `visitante-${fileKey}.webp`
            const localPath = join(visitDir, filename)

            await writeFile(localPath, webpBuffer)
            photoPath = `uploads/visitantes/${filename}`
          }
        }
      } catch (imgErr) {
        console.error(`Erro baixar foto visitante ${v.nome}:`, imgErr)
      }
    }

    let vis = null
    if (cpf) {
      vis = await prisma.sipeVisitante.findFirst({ where: { cpf } })
    }
    if (!vis) {
      vis = await prisma.sipeVisitante.findFirst({ where: { nome: v.nome } })
    }

    const upsertData = {
      nome: v.nome,
      cpf: cpf || null,
      parentesco: v.parentesco,
      ...(photoPath ? { photoPath } : {})
    }

    if (vis) {
      vis = await prisma.sipeVisitante.update({
        where: { id: vis.id },
        data: upsertData
      })
    } else {
      vis = await prisma.sipeVisitante.create({
        data: upsertData
      })
    }

    await prisma.sipeVinculoVisitante.upsert({
      where: {
        apenadoId_visitanteId: {
          apenadoId,
          visitanteId: vis.id
        }
      },
      create: {
        apenadoId,
        visitanteId: vis.id,
        ativo: v.ativo
      },
      update: {
        ativo: v.ativo
      }
    })
  })

  await Promise.all(visitorDetailsPromises)
}

async function parseAndSaveAdvogadosCheerio(html: string, apenadoId: string): Promise<boolean> {
  const $ = cheerio.load(html)
  const linksAdvogados: Array<{ href: string; text: string }> = []
  
  $('a').each((_, a) => {
    const href = $(a).attr('href') || ''
    const text = $(a).text().trim()
    const hasAdvLink = href.includes('/advogados/') || href.includes('/detalhaclientes') || href.includes('/advogado/')
    if (hasAdvLink && text.length > 3) {
      linksAdvogados.push({ href, text })
    }
  })

  if (linksAdvogados.length === 0) {
    return false
  }

  for (const item of linksAdvogados) {
    const match = item.href.match(/\/advogados\/(\d+)/) || item.href.match(/\/advogado\/(\d+)/)
    if (!match) continue

    const advSipeId = parseInt(match[1])
    if (isNaN(advSipeId) || advSipeId <= 0) continue

    const nomeAdv = item.text.replace(/^(Dr\.|Dra\.|Dr|Dra|Advogado|Advogada)\s+/i, '').trim().toUpperCase()

    const adv = await prisma.sipeAdvogado.upsert({
      where: { sipeId: advSipeId },
      create: {
        sipeId: advSipeId,
        nome: nomeAdv || 'ADVOGADO IMPORTADO',
      },
      update: {
        nome: nomeAdv || undefined,
      },
    })

    await prisma.sipeVinculoAdvogado.upsert({
      where: {
        apenadoId_advogadoId: {
          apenadoId,
          advogadoId: adv.id,
        },
      },
      create: {
        apenadoId,
        advogadoId: adv.id,
        ativo: true,
      },
      update: {
        ativo: true,
      },
    })
  }

  return true
}

async function saveAndLinkComplementaryPhotoCheerio(
  src: string,
  apenadoId: string,
  apenadoLocalId: string | null,
  descricao: string
): Promise<void> {
  try {
    const cleanPhotoSrc = src.replace(/_fotoUsuario/i, '')
    const photoPathRelative = cleanPhotoSrc.replace(SIPE_URL, '')
    let proxyPhoto = await fetchSipeViaProxy(photoPathRelative)
    if (!proxyPhoto && cleanPhotoSrc !== src) {
      const fallbackPathRelative = src.replace(SIPE_URL, '')
      proxyPhoto = await fetchSipeViaProxy(fallbackPathRelative)
    }

    if (proxyPhoto && proxyPhoto.is_binary && proxyPhoto.data) {
      const base64Data = proxyPhoto.data
      if (base64Data.includes(',')) {
        const base64Content = base64Data.split(',')[1]
        const imageBuffer = Buffer.from(base64Content, 'base64')
        const webpBuffer = await sharp(imageBuffer)
          .resize(800, 800, { fit: 'inside', withoutEnlargement: true })
          .webp({ quality: 90 })
          .toBuffer()

        const dir = getApenadosDir()
        const { mkdir, writeFile } = await import('fs/promises')
        await mkdir(dir, { recursive: true })
        
        const fileHash = createHash('md5').update(src).digest('hex')
        const filename = `sipe-comp-${apenadoId}-${fileHash}.webp`
        const localPath = join(dir, filename)

        await writeFile(localPath, webpBuffer)
        const photoPath = `uploads/apenados/${filename}`

        const exists = await prisma.sipeFotoComplementar.findFirst({
          where: { apenadoImportadoId: apenadoId, photoPath }
        })

        if (!exists) {
          await prisma.sipeFotoComplementar.create({
            data: {
              apenadoImportadoId: apenadoId,
              photoPath,
              descricao,
              apenadoLocalId: apenadoLocalId || undefined
            }
          })
        }
      }
    }
  } catch (err) {
    console.error(`Erro ao salvar foto complementar no Cheerio:`, err)
  }
}

export async function scrapeApenadoFichaFast(
  sipeId: number,
  unidadeNome?: string | null,
  useSearch = false
): Promise<void> {
  // Configura a unidade da sessão para o proxy se informada e resolvida
  if (unidadeNome) {
    if (unidadeNome.includes(' — ')) {
      unidadeNome = unidadeNome.split(' — ')[1]
    }
    const unidadeId = await resolveUnidadeIdByNome(unidadeNome)
    if (unidadeId) {
      globalThis.__sipeFallbackUnidade = unidadeId
    } else {
      globalThis.__sipeFallbackUnidade = null
    }
  } else {
    globalThis.__sipeFallbackUnidade = null
  }

  let editHtml = ''
  
  if (useSearch) {
    const searchPath = `/apenados/index?escolha=nomeapenado&parametro=${sipeId}`
    const proxyData = await fetchSipeViaProxy(searchPath)
    if (!proxyData || proxyData.is_binary || !proxyData.html) {
      throw new Error('APENADO_NAO_ENCONTRADO')
    }
    const $ = cheerio.load(proxyData.html)
    
    let link: string | null = null
    let listagemUnidade: string | null = null
    let listagemCela: string | null = null

    const rows = $('table tbody tr').get()
    for (const row of rows) {
      const text = $(row).text()
      if (text.includes(String(sipeId))) {
        const a = $(row).find('a[href]')
        if (a.length) {
          link = a.attr('href') || null
        }
        
        const tds = $(row).find('td')
        if (tds.length >= 6) {
          listagemUnidade = $(tds.get(4)).text().trim() || null
          listagemCela = $(tds.get(5)).text().trim() || null
        }
        break
      }
    }
    if (!link) {
      const anchors = $('a[href]').get()
      for (const a of anchors) {
        const href = $(a).attr('href') || ''
        if (href.includes(`/apenados/${sipeId}`)) {
          link = href
          break
        }
      }
    }
    if (!link) {
      throw new Error('APENADO_NAO_ENCONTRADO')
    }

    if (listagemUnidade && !unidadeNome) {
      unidadeNome = listagemUnidade
      const unidadeId = await resolveUnidadeIdByNome(listagemUnidade)
      if (unidadeId) {
        globalThis.__sipeFallbackUnidade = unidadeId
      }
    }

    if (listagemUnidade || listagemCela) {
      const cached = listagemInfoCache.get(sipeId)
      listagemInfoCache.set(sipeId, {
        unidadeNome: listagemUnidade || cached?.unidadeNome || '',
        cela: listagemCela || cached?.cela || '',
        situacao: cached?.situacao || undefined
      })
    }
    
    // 🔐 Garantia de ativação do apenado na sessão do Laravel do SIPE
    await fetchSipeViaProxy(`/apenados/${sipeId}/selecionarOpcao`).catch(() => {})

    const cleanLinkPath = link.replace(SIPE_URL, '')
    const editProxyData = await fetchSipeViaProxy(cleanLinkPath)
    if (!editProxyData || editProxyData.is_binary || !editProxyData.html) {
      throw new Error('APENADO_NAO_ENCONTRADO')
    }
    editHtml = editProxyData.html
  } else {
    await fetchSipeViaProxy(`/apenados/${sipeId}/selecionarOpcao`).catch(() => {})
    const editPath = `/apenados/${sipeId}/editar`
    const proxyData = await fetchSipeViaProxy(editPath)
    if (!proxyData || proxyData.is_binary || !proxyData.html) {
      throw new Error('APENADO_NAO_ENCONTRADO')
    }
    editHtml = proxyData.html
  }

  const parseResult = parseApenadoFichaHtmlCheerio(editHtml)
  const dados = parseResult.dados
  const imagesInfo = parseResult.imagesInfo
  
  if (!dados.nome) {
    throw new Error('APENADO_NAO_ENCONTRADO')
  }

  let faccaoId: string | null = null
  let lookupSipeId = dados.faccaoSipeId
  if (lookupSipeId && lookupSipeId > 0) {
    const faccao = await prisma.sipeFaccao.findUnique({
      where: { sipeId: lookupSipeId },
    })
    faccaoId = faccao?.id ?? null
  }

  let photoPath: string | null = null
  let fotoAtualizada = false
  const photoSrc = imagesInfo.mainSrc
  const complementaryPhotoSrcs = imagesInfo.allSrcs.filter(src => {
    const s = src.toLowerCase()
    return src && s !== photoSrc &&
      !s.includes('logo') && !s.includes('sejus') && !s.includes('governo') &&
      !s.includes('brasao') && !s.includes('bandeira') && !s.includes('icon') &&
      !s.includes('chosen') && !s.includes('select')
  })

  if (photoSrc) {
    const cleanPhotoSrc = photoSrc.replace(/_fotoUsuario/i, '')
    const photoPathRelative = cleanPhotoSrc.replace(SIPE_URL, '')
    let proxyPhoto = await fetchSipeViaProxy(photoPathRelative)
    if (!proxyPhoto && cleanPhotoSrc !== photoSrc) {
      const fallbackPathRelative = photoSrc.replace(SIPE_URL, '')
      proxyPhoto = await fetchSipeViaProxy(fallbackPathRelative)
    }

    if (proxyPhoto && proxyPhoto.is_binary && proxyPhoto.data) {
      const base64Data = proxyPhoto.data
      if (base64Data.includes(',')) {
        const base64Content = base64Data.split(',')[1]
        const imageBuffer = Buffer.from(base64Content, 'base64')
        const webpBuffer = await sharp(imageBuffer)
          .resize(800, 800, { fit: 'inside', withoutEnlargement: true })
          .webp({ quality: 90 })
          .toBuffer()

        const dir = getApenadosDir()
        const { mkdir, writeFile, readFile } = await import('fs/promises')
        await mkdir(dir, { recursive: true })
        const filename = `sipe-${sipeId}.webp`
        const localPath = join(dir, filename)

        let shouldWrite = true
        if (existsSync(localPath)) {
          try {
            const existingBuffer = await readFile(localPath)
            const currentHash = createHash('sha256').update(webpBuffer).digest('hex')
            const existingHash = createHash('sha256').update(existingBuffer).digest('hex')
            if (currentHash === existingHash) {
              shouldWrite = false
            }
          } catch {}
        }

        if (shouldWrite) {
          await writeFile(localPath, webpBuffer)
          fotoAtualizada = true
        }

        photoPath = `uploads/apenados/${filename}`
      }
    }
  }

  // Busca o apenado existente no banco local para preservar dados da listagem (como situação e cela) caso o cache esteja vazio
  const existingApenado = await prisma.sipeApenadoImportado.findUnique({
    where: { sipeId },
    select: { situacao: true, cela: true, unidade: true }
  })

  const cela = listagemInfoCache.get(sipeId)?.cela ?? existingApenado?.cela ?? dados.celaFicha ?? null
  const situacao = listagemInfoCache.get(sipeId)?.situacao ?? existingApenado?.situacao ?? dados.situacao ?? null
  const unidade = unidadeNome ?? existingApenado?.unidade ?? dados.unidadeFicha ?? null

  const nomeApenadoUpper = (dados.nome || 'SEM NOME').trim().toUpperCase()
  let faccaoNome: string | null = null
  if (faccaoId) {
    const faccaoObj = await prisma.sipeFaccao.findUnique({ where: { id: faccaoId } })
    faccaoNome = faccaoObj?.nome ?? null
  }

  const matriculaIdentifier = dados.rji || dados.cpf || null
  let localApenado = null

  if (matriculaIdentifier) {
    localApenado = await prisma.apenado.findFirst({
      where: { matricula: matriculaIdentifier }
    })
  }

  let nomeFinalApenado = nomeApenadoUpper

  if (!localApenado) {
    const apenadoExistenteMesmoNome = await prisma.apenado.findFirst({
      where: { name: nomeApenadoUpper }
    })

    if (apenadoExistenteMesmoNome) {
      nomeFinalApenado = `${nomeApenadoUpper} SIPE`
      localApenado = await prisma.apenado.findFirst({
        where: { name: nomeFinalApenado }
      })
    }
  }

  if (!localApenado) {
    localApenado = await prisma.apenado.create({
      data: {
        name: nomeFinalApenado,
        matricula: dados.rji || dados.cpf || null,
        unidade: unidade || null,
        faccao: faccaoNome || null,
        photoPath: photoPath || null,
      }
    })
  } else {
    const updateData: any = {}
    if (photoPath && (fotoAtualizada || !localApenado.photoPath)) {
      updateData.photoPath = photoPath
      if (fotoAtualizada) {
        updateData.photoHash = null
        updateData.photoQuality = null
        updateData.photoHashSha = null
        updateData.faceDescriptor = null
        updateData.detScore = null
      }
    }
    
    if ((dados.rji || dados.cpf) && !localApenado.matricula) {
      updateData.matricula = dados.rji || dados.cpf
    }
    if (unidade && localApenado.unidade !== unidade) {
      updateData.unidade = unidade
    }
    if (!localApenado.faccao && faccaoNome) {
      updateData.faccao = faccaoNome
    }

    if (Object.keys(updateData).length > 0) {
      localApenado = await prisma.apenado.update({
        where: { id: localApenado.id },
        data: updateData
      })
    }
  }

  const resolvedUnidade = unidade || dados.unidadeFicha || cela || undefined

  const upsertData = {
    nome: dados.nome || 'SEM NOME',
    nomeOutro: dados.nomeOutro,
    cpf: dados.cpf,
    rg: dados.rg,
    rgOrgao: dados.rgOrgao,
    dataNascimento: dados.dataNascimento,
    naturalidade: dados.naturalidade,
    sexo: dados.sexo,
    etnia: dados.etnia,
    orientacaoSexual: dados.orientacaoSexual,
    tipoSanguineo: dados.tipoSanguineo,
    grauInstrucao: dados.grauInstrucao,
    religiao: dados.religiao,
    estadoCivil: dados.estadoCivil,
    nomeConjuge: dados.nomeConjuge,
    qtdFilhos: dados.qtdFilhos,
    nomeMae: dados.nomeMae,
    nomePai: dados.nomePai,
    telefone: dados.telefone,
    rji: dados.rji,
    regime: dados.regime,
    situacao: situacao || undefined,
    dataEntrada: dados.dataEntrada,
    dataPrisao: dados.dataPrisao,
    tempoPena: dados.tempoPena,
    monitorado: dados.monitorado,
    intramuro: dados.intramuro,
    presoOriundo: dados.presoOriundo,
    oficioEntrada: dados.oficioEntrada,
    faccaoId,
    photoPath,
    unidade: resolvedUnidade,
    cela: cela || undefined,
    ultimaSyncAt: new Date(),
  }

  const apenado = await prisma.sipeApenadoImportado.upsert({
    where: { sipeId },
    create: { sipeId, ...upsertData },
    update: upsertData,
    include: { faccao: true }
  })

  try {
    const aipSyncData = {
      nome: apenado.nome,
      nomeOutro: apenado.nomeOutro,
      cpf: apenado.cpf,
      rg: apenado.rg,
      rgOrgao: apenado.rgOrgao,
      dataNascimento: apenado.dataNascimento,
      sexo: apenado.sexo,
      etnia: apenado.etnia,
      naturalidade: apenado.naturalidade,
      orientacaoSexual: apenado.orientacaoSexual,
      tipoSanguineo: apenado.tipoSanguineo,
      grauInstrucao: apenado.grauInstrucao,
      religiao: apenado.religiao,
      estadoCivil: apenado.estadoCivil,
      nomeConjuge: apenado.nomeConjuge,
      qtdFilhos: apenado.qtdFilhos,
      nomeMae: apenado.nomeMae,
      nomePai: apenado.nomePai,
      telefone: apenado.telefone,
      rji: apenado.rji,
      unidade: apenado.unidade,
      cela: apenado.cela,
      regime: apenado.regime,
      situacao: apenado.situacao,
      dataEntrada: apenado.dataEntrada,
      dataPrisao: apenado.dataPrisao,
      tempoPena: apenado.tempoPena,
      faccao: apenado.faccao?.nome || null,
      monitorado: apenado.monitorado,
      intramuro: apenado.intramuro,
      presoOriundo: apenado.presoOriundo,
      oficioEntrada: apenado.oficioEntrada,
      logradouro: apenado.logradouro,
      numero: apenado.numero,
      complemento: apenado.complemento,
      bairro: apenado.bairro,
      cidade: apenado.cidade,
      uf: apenado.uf,
      cep: apenado.cep,
      photoPath: apenado.photoPath,
      ultimaSincAt: new Date(),
    }

    const apenadoEmAIP = await prisma.aIPApenado.findUnique({
      where: { sipeId }
    })

    if (apenadoEmAIP) {
      await prisma.aIPApenado.update({
        where: { id: apenadoEmAIP.id },
        data: aipSyncData
      }).catch((err) => {
        console.error(`[AIP] Erro ao sincronizar ${sipeId}:`, err.message)
      })
      console.log(`[AIP] ✅ Apenado #${sipeId} atualizado em AIP (unidade="${aipSyncData.unidade}")`)
    }
  } catch (err) {
    console.error(`[AIP] Erro na sincronização AIP:`, err)
  }

  const $ = cheerio.load(editHtml)
  const csrfToken = $('meta[name="csrf-token"]').attr('content') || 
                    $('input[name="_token"]').attr('value') ||
                    $('input[name="_token"]').val()?.toString() ||
                    editHtml.match(/CSRF_TOKEN\s*=\s*['"]([^'"]+)['"]/i)?.[1]

  const subPagesPromises = [
    fetchSipeViaProxy(`/apenados/${sipeId}/incluirProcessos`),
    fetchSipeViaProxy(`/apenados/${sipeId}/alcunhas`),
    fetchSipeViaProxy(`/apenados/${sipeId}/enderecos`),
    fetchSipeViaProxy(`/apenados/${sipeId}/mudarcela`),
    fetchSipeViaProxy(`/anexos/${sipeId}/index`),
    fetchSipeViaProxy(`/autorizacoes/${sipeId}/mostrar`),
    fetchSipeViaProxy(`/apenados/${sipeId}/advogados`),
    fetchSipeViaProxy(`/apenados/${sipeId}/credenciamento`),
    fetchSipeViaProxy(`/apenados/${sipeId}/atendimentos`),
    fetchSipeViaProxy(`/apenados/${sipeId}/credenciados`),
  ]

  let fichaGeralPromise: Promise<SipeProxyResponse | null> = Promise.resolve(null)
  if (csrfToken) {
    fichaGeralPromise = requestSipeViaProxy({
      path: '/relatorios/fichaGeral',
      method: 'POST',
      form: {
        _token: csrfToken,
        apenado_id: String(sipeId),
        'listar[]': ['DP', 'M', 'A', 'V']
      },
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    })
  }

  const [
    processosData,
    alcunhasData,
    enderecosData,
    mudarCelaData,
    anexosData,
    visitantesData,
    advogadosData,
    credenciamentoData,
    atendimentosData,
    credenciadosData,
    fichaGeralData
  ] = await Promise.all([
    ...subPagesPromises,
    fichaGeralPromise
  ])

  const independentPromises: Promise<any>[] = []

  if (processosData?.html) {
    independentPromises.push(parseAndSaveProcessosCheerio(processosData.html, apenado.id))
  }
  if (alcunhasData?.html) {
    independentPromises.push(parseAndSaveAlcunhasCheerio(alcunhasData.html, apenado.id))
  }
  if (enderecosData?.html) {
    independentPromises.push(parseAndSaveEnderecoCheerio(enderecosData.html, apenado.id))
  }
  if (mudarCelaData?.html) {
    independentPromises.push(parseAndSaveMudarCelaCheerio(mudarCelaData.html, apenado.id))
  }
  if (anexosData?.html) {
    independentPromises.push(parseAndSaveDocumentosCheerio(anexosData.html, apenado.id, localApenado.id))
  }
  for (const src of complementaryPhotoSrcs) {
    independentPromises.push(saveAndLinkComplementaryPhotoCheerio(src, apenado.id, localApenado.id, 'Foto de Identificação'))
  }

  // Executa os dados estruturados independentes em paralelo
  await Promise.all(independentPromises)

  // Salva visitantes e advogados de forma sequencial para evitar Race Conditions
  if (visitantesData?.html) {
    await parseAndSaveVisitantesCheerio(visitantesData.html, apenado.id)
  }
  
  let salvouAdv = false
  if (advogadosData?.html) {
    salvouAdv = await parseAndSaveAdvogadosCheerio(advogadosData.html, apenado.id)
  }
  if (!salvouAdv && credenciamentoData?.html) {
    salvouAdv = await parseAndSaveAdvogadosCheerio(credenciamentoData.html, apenado.id)
  }
  if (!salvouAdv && atendimentosData?.html) {
    salvouAdv = await parseAndSaveAdvogadosCheerio(atendimentosData.html, apenado.id)
  }
  if (!salvouAdv && credenciadosData?.html) {
    salvouAdv = await parseAndSaveAdvogadosCheerio(credenciadosData.html, apenado.id)
  }

  // Por último, executa a Ficha Geral consolidada (evitando duplicar advogados e visitantes criados acima)
  if (fichaGeralData?.html) {
    await parseAndSaveFichaGeralCheerio(fichaGeralData.html, apenado.id)
  }

  console.log(`[SCRAPER FAST] 🚀 Apenado #${sipeId} processado de forma sequencial-segura com sucesso!`)

  if (globalThis.__sipeState && (globalThis.__sipeState.tipo === 'UNIDADES' || globalThis.__sipeState.tipo === 'UNIDADES_FAST')) {
    await saveApenadoUnidadePrisional(sipeId, apenado.id)
  }
}

// ── Scraping de Unidades Prisionais ──────────────────────────

export async function scrapeUnidadesPrisionais(jobId?: string): Promise<Array<{ id: string; nome: string }>> {
  if (!jobId) {
    setCurrentSipeEngine('python-sdk', SIPE_UNIDADE)
  }

  if (jobId) {
    await dbProgress(jobId, { fase: 'Login', log: 'Iniciando sessão no SIPE para unidades...' })
  }

  const context = await createSession()
  const page = await context.newPage()
  markFallbackSessionDirty(page)

  try {
    if (isPythonSdkEngine()) {
      if (jobId) {
        await dbProgress(jobId, { fase: 'Coletando unidades', log: 'Coletando unidades via SDK Python...' })
      }

      for (const path of ['/selectRole', '/selectRole/1']) {
        const proxyData = await fetchSipeViaProxy(path)
        const html = proxyData?.html ?? proxyData?.text
        if (!html) continue

        await page.setContent(html)
        const unidades = await page.evaluate(() => {
          const selects = document.querySelectorAll('select')
          if (selects.length < 2) return [] as Array<{ id: string; nome: string }>
          const unitSelect = selects[1] as HTMLSelectElement
          return Array.from(unitSelect.options)
            .filter((o) => o.value && o.value !== '' && o.value !== '0')
            .map((o) => ({ id: o.value, nome: (o.textContent ?? '').trim() }))
        })

        if (unidades.length > 0) {
          if (jobId) {
            await dbProgress(jobId, { log: `Encontradas ${unidades.length} unidades via SDK. Atualizando cache...` })
          }

          globalThis.__sipeUnidadesCache = { data: unidades, fetchedAt: Date.now() }
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

          return unidades
        }
      }
    }

    if (jobId) {
      await dbProgress(jobId, { log: 'Realizando login no SIPE...' })
    }
    await ensureFallbackLogin(page)

    if (jobId) {
      await dbProgress(jobId, { fase: 'Coletando unidades', log: 'Acessando tela de seleção de papéis...' })
    }

    // Navega para /selectRole para garantir que está na tela de seleção
    await gotoSipeWithFallback(page, '/selectRole', { waitUntil: 'domcontentloaded', timeout: 20_000 }).catch(async () => {
      await gotoSipeWithFallback(page, '/selectRole/1', { waitUntil: 'domcontentloaded' })
    })

    await page.locator('select').nth(1).waitFor({ state: 'attached', timeout: 15_000 })

    const unidades = await page.evaluate(() => {
      const selects = document.querySelectorAll('select')
      if (selects.length < 2) return [] as Array<{ id: string; nome: string }>
      const unitSelect = selects[1] as HTMLSelectElement
      return Array.from(unitSelect.options)
        .filter((o) => o.value && o.value !== '' && o.value !== '0')
        .map((o) => ({ id: o.value, nome: (o.textContent ?? '').trim() }))
    })

    if (unidades.length === 0) {
      throw new Error('Nenhuma unidade prisional encontrada no select do SIPE')
    }

    if (jobId) {
      await dbProgress(jobId, { log: `Encontradas ${unidades.length} unidades. Atualizando cache...` })
    }

    // Persiste no cache global em memória
    globalThis.__sipeUnidadesCache = { data: unidades, fetchedAt: Date.now() }

    // Salva no banco de dados para persistência
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

    return unidades
  } finally {
    await context.close()
  }
}

// ── Agendador automático em background (Scheduler) ──────────

let autoSyncTimeout: NodeJS.Timeout | null = null

function setupAutoSyncScheduler() {
  if (autoSyncTimeout) return // Evita múltiplos agendadores iniciados em hot-reloads

  // Executa verificação periódica a cada 15 minutos (900.000 ms)
  const INTERVAL_CHECK = 15 * 60 * 1000

  const checkAndRunAutoSync = async () => {
    try {
      // 1. Lê a configuração de automação do banco
      const autoSyncConfig = await prisma.systemConfig.findUnique({
        where: { key: 'sipe_auto_sync_unidades' }
      })
      const isEnabled = (autoSyncConfig?.value as any)?.enabled === true

      if (!isEnabled) return

      const intervalHoursConfig = await prisma.systemConfig.findUnique({
        where: { key: 'sipe_sync_unidades_interval_hours' }
      })
      const intervalHours = parseInt((intervalHoursConfig?.value as any)?.hours ?? '24') || 24

      // 2. Busca o último job do tipo 'UNIDADES' que foi concluído com sucesso
      const ultimoJobCompleto = await prisma.sipeSyncJob.findFirst({
        where: { tipo: 'UNIDADES', status: 'COMPLETED' },
        orderBy: { finalizadoEm: 'desc' }
      })

      const precisaRodar = !ultimoJobCompleto || 
        (ultimoJobCompleto.finalizadoEm && 
         Date.now() - new Date(ultimoJobCompleto.finalizadoEm).getTime() > intervalHours * 60 * 60 * 1000)

      if (precisaRodar) {
        // Verifica se já existe algum job ativamente rodando
        const jobAtivo = await prisma.sipeSyncJob.findFirst({
          where: { status: 'RUNNING' }
        })
        if (jobAtivo) {
          console.log('[AUTO-SYNC] Ignorando sincronização automática: já existe outro job em execução')
          return
        }

        console.log('[AUTO-SYNC] Iniciando sincronização automática de unidades prisionais...')
        
        // Cria o job de sincronização automática
        const job = await prisma.sipeSyncJob.create({
          data: {
            tipo: 'UNIDADES',
            unidade: 'SYSTEM',
            unidadeNome: 'AUTOMÁTICO (SISTEMA)',
            status: 'RUNNING',
            iniciadoEm: new Date(),
            criadoPor: 'SYSTEM'
          }
        })

        scrapeUnidadesPrisionais(job.id)
          .then(async () => {
            console.log('[AUTO-SYNC] ✅ Sincronização automática concluída com sucesso')
            await prisma.sipeSyncJob.update({
              where: { id: job.id },
              data: { status: 'COMPLETED', finalizadoEm: new Date() }
            })
          })
          .catch(async (err) => {
            const errMsg = err?.message ?? String(err)
            console.error('[AUTO-SYNC] ❌ Sincronização automática falhou:', errMsg)
            await prisma.sipeSyncJob.update({
              where: { id: job.id },
              data: {
                status: 'FAILED',
                finalizadoEm: new Date(),
                log: errMsg
              }
            })
          })
      }
    } catch (err) {
      console.error('[AUTO-SYNC] Erro no scheduler:', err)
    }
  }

  // Agenda primeira execução curta e depois o loop
  setTimeout(checkAndRunAutoSync, 10_000)
  autoSyncTimeout = setInterval(checkAndRunAutoSync, INTERVAL_CHECK)
}

// DESATIVADO: Auto-sync scheduler foi removido
// Razão: Usuários devem ter controle total sobre quando a sincronização ocorre
// Sincronizações automáticas eram criando apenados em AIP sem autorização manual
// if (typeof window === 'undefined') {
//   setupAutoSyncScheduler()
// }

// ── Sincronização Isolada para Unidades Prisionais ──────────────────────────

async function saveApenadoUnidadePrisional(sipeId: number, apenadoId: string): Promise<void> {
  try {
    const apenado = await prisma.sipeApenadoImportado.findUnique({
      where: { id: apenadoId },
      include: {
        faccao: true,
        alcunhas: true,
        processos: true,
        historicos: { orderBy: { datahora: 'desc' } },
        vinculosAdvogado: { include: { advogado: true } },
        vinculosVisitante: { include: { visitante: true } },
        fotosComplementares: true,
      }
    })

    if (!apenado) return

    const processosJson = apenado.processos.map(p => ({
      id: p.id,
      sipeProcessoId: p.sipeProcessoId,
      numero: p.numero,
      vara: p.vara,
      artigos: p.artigos,
      tempoPena: p.tempoPena,
      principal: p.principal
    }))

    const alcunhasJson = apenado.alcunhas.map(a => ({
      alcunha: a.alcunha
    }))

    const historicosJson = apenado.historicos.map(h => ({
      id: h.id,
      tipo: h.tipo,
      descricao: h.descricao,
      datahora: h.datahora ? h.datahora.toISOString() : null,
      cela: h.cela,
      unidade: h.unidade
    }))

    const advogadosJson = apenado.vinculosAdvogado.map(va => ({
      id: va.advogado.id,
      nome: va.advogado.nome,
      oab: va.advogado.oab
    }))

    const visitantesJson = apenado.vinculosVisitante.map(vv => ({
      id: vv.visitante.id,
      nome: vv.visitante.nome,
      cpf: vv.visitante.cpf,
      parentesco: vv.visitante.parentesco,
      photoPath: vv.visitante.photoPath,
      ativo: vv.ativo
    }))

    const fotosComplementaresJson = apenado.fotosComplementares.map(fc => ({
      id: fc.id,
      photoPath: fc.photoPath,
      descricao: fc.descricao,
      createdAt: fc.createdAt.toISOString()
    }))

    const upsertData = {
      nome: apenado.nome,
      nomeOutro: apenado.nomeOutro,
      cpf: apenado.cpf,
      rg: apenado.rg,
      rgOrgao: apenado.rgOrgao,
      dataNascimento: apenado.dataNascimento,
      sexo: apenado.sexo,
      etnia: apenado.etnia,
      naturalidade: apenado.naturalidade,
      orientacaoSexual: apenado.orientacaoSexual,
      tipoSanguineo: apenado.tipoSanguineo,
      grauInstrucao: apenado.grauInstrucao,
      religiao: apenado.religiao,
      estadoCivil: apenado.estadoCivil,
      nomeConjuge: apenado.nomeConjuge,
      qtdFilhos: apenado.qtdFilhos,
      nomeMae: apenado.nomeMae,
      nomePai: apenado.nomePai,
      telefone: apenado.telefone,
      rji: apenado.rji,
      unidade: apenado.unidade,
      cela: apenado.cela,
      regime: apenado.regime,
      situacao: apenado.situacao,
      dataEntrada: apenado.dataEntrada,
      dataPrisao: apenado.dataPrisao,
      tempoPena: apenado.tempoPena,
      monitorado: apenado.monitorado,
      intramuro: apenado.intramuro,
      presoOriundo: apenado.presoOriundo,
      oficioEntrada: apenado.oficioEntrada,
      photoPath: apenado.photoPath,
      faccaoId: apenado.faccaoId,
      logradouro: apenado.logradouro,
      numero: apenado.numero,
      complemento: apenado.complemento,
      bairro: apenado.bairro,
      cidade: apenado.cidade,
      uf: apenado.uf,
      cep: apenado.cep,
      celeAtual: apenado.celeAtual,
      ultimaMovimentacao: apenado.ultimaMovimentacao,
      
      processos: processosJson,
      alcunhas: alcunhasJson,
      historicos: historicosJson,
      advogados: advogadosJson,
      visitantes: visitantesJson,
      fotosComplementares: fotosComplementaresJson,
      
      ultimaSyncAt: new Date(),
    }

    await prisma.sipeApenadoUnidadePrisional.upsert({
      where: { sipeId },
      create: { sipeId, ...upsertData },
      update: upsertData,
    })

    console.log(`[UNIDADES PRISIONAIS] ✅ Apenado #${sipeId} copiado de forma independente para a tabela de Unidades Prisionais`)
  } catch (err) {
    console.error(`[UNIDADES PRISIONAIS] ❌ Erro ao salvar cópia independente para #${sipeId}:`, err)
  }
}
