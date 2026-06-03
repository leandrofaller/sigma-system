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
}

declare global {
  // eslint-disable-next-line no-var
  var __sipeState: SipeSyncProgress | null
  // eslint-disable-next-line no-var
  var __sipeStopFlag: boolean
}

// Initialize once per process; no-op on hot-reloads
if (globalThis.__sipeState === undefined) globalThis.__sipeState = null
if (globalThis.__sipeStopFlag === undefined) globalThis.__sipeStopFlag = false

export function getSipeState(): SipeSyncProgress | null {
  return globalThis.__sipeState
}

export function stopSipeJob(): void {
  globalThis.__sipeStopFlag = true
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

  await prisma.sipeSyncJob.updateMany({
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
    data: { status: 'INTERRUPTED' },
  })
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
export function startSipeSync(jobId: string, unidadeId: string): void {
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

    if (job.tipo === 'UNIDADES') {
      await runScrapeTodasUnidades(jobId)
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
export function resumeSipeSync(jobId: string, unidadeId: string): void {
  startSipeSync(jobId, unidadeId) // startSipeSync detects existing IDs in DB
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
            globalThis.__sipeState!.erros++
            const errMsg = `Erro ao sincronizar ${adv.nome} (${adv.oab}): ${err?.message || err}`
            console.error(`[CNA API OAB] ${errMsg}`)
            
            refreshMemory(jobId, { ultimoLog: errMsg })
            await dbProgress(jobId, {
              erros: globalThis.__sipeState!.erros,
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

  // Tipos sem unidade específica usam a unidade padrão '3' apenas para fazer login
  const loginUnidade = (unidadeId === 'EXTRAMUROS' || unidadeId === 'GLOBAL') ? '3' : unidadeId

  try {
    const ok = await login(page, loginUnidade)
    if (!ok) throw new Error('Falha no login do SIPE')

    log(jobId, 'Login realizado com sucesso')

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

      const useSearch = job.tipo === 'IDS_MANUAIS' || job.tipo === 'EXTRAMUROS' || job.tipo === 'GLOBAL'

      try {
        await withRetry(async () => {
          try {
            if (job.tipo === 'ADVOGADOS') {
              await scrapeAdvogadoDetalhe(page, sipeId, jobId)
            } else {
              await scrapeApenadoFicha(page, sipeId, job.unidadeNome, useSearch)
            }
          } catch (err: any) {
            if (err?.message === 'SESSAO_EXPIRADA') {
              log(jobId, 'Sessão expirada detectada. Re-autenticando no SIPE...')
              await login(page, loginUnidade)

              if (job.tipo === 'ADVOGADOS') {
                await scrapeAdvogadoDetalhe(page, sipeId, jobId)
              } else {
                await scrapeApenadoFicha(page, sipeId, job.unidadeNome, useSearch)
              }
            } else {
              throw err
            }
          }
        })
        lastProcessedId = sipeId
        globalThis.__sipeState!.processado++
        globalThis.__sipeState!.pct = globalThis.__sipeState!.total
          ? Math.round(
              (globalThis.__sipeState!.processado / globalThis.__sipeState!.total) * 100
            )
          : 0

        // Persiste cursor a cada registro para recovery sem perda em crash/restart
        await dbProgress(jobId, {
          processado: globalThis.__sipeState!.processado,
          ultimoIdProcessado: sipeId,
        })
        // Polite delay
        await page.waitForTimeout(300 + Math.random() * 500)
      } catch (err) {
        globalThis.__sipeState!.erros++
        const msg = job.tipo === 'ADVOGADOS'
          ? `Erro advogado #${sipeId} (após 3 tentativas): ${err}`
          : `Erro apenado #${sipeId} (após 3 tentativas): ${err}`
        globalThis.__sipeState!.ultimoLog = msg
        await dbProgress(jobId, { erros: globalThis.__sipeState!.erros, log: msg })
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
    await context.close()
  }
}

async function runScrapeTodasUnidades(jobId: string): Promise<void> {
  const job = await prisma.sipeSyncJob.findUnique({ where: { id: jobId } })
  if (!job) throw new Error('Job não encontrado')

  await dbProgress(jobId, {
    log: 'Iniciando sessão no SIPE para sincronização de todas as unidades...',
    fase: 'Login',
  })
  refreshMemory(jobId, { fase: 'Login', ultimoLog: 'Iniciando sessão no SIPE...' })

  const context = await createSession()
  const page = await context.newPage()

  try {
    const ok = await login(page, SIPE_UNIDADE)
    if (!ok) throw new Error('Falha no login do SIPE')
    log(jobId, 'Login realizado com sucesso')

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
      await page.goto(`${SIPE_URL}/selectRole`, { waitUntil: 'domcontentloaded', timeout: 20_000 }).catch(async () => {
        await page.goto(`${SIPE_URL}/selectRole/1`, { waitUntil: 'domcontentloaded' })
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
              await scrapeApenadoFicha(page, sipeId, u.nome)
            } catch (err: any) {
              if (err?.message === 'SESSAO_EXPIRADA') {
                log(jobId, `Sessão expirada. Re-autenticando para unidade "${u.nome}"...`)
                await login(page, u.id)
                await scrapeApenadoFicha(page, sipeId, u.nome)
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

          // 🔧 OTIMIZAÇÃO: Delay maior para governos servidores lentos (2-5s)
          await page.waitForTimeout(2000 + Math.random() * 3000)
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
const listagemInfoCache = new Map<number, { cela?: string }>();

let lastCacheClearPageCount = 0;

function clearCacheIfNeeded(currentPageCount: number) {
  if (currentPageCount % 50 === 0 && currentPageCount !== lastCacheClearPageCount) {
    const sizeAntes = listagemInfoCache.size;
    listagemInfoCache.clear();
    lastCacheClearPageCount = currentPageCount;
    console.log(`♻️ [Page ${currentPageCount}] Cache limpo: removidas ${sizeAntes} entradas`);
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

async function coletarIdsApenados(
  page: Page,
  unidadeId: string,
  jobId: string,
  unidadeNomeEsperada?: string | null,
  globalMode = false
): Promise<number[]> {
  // Validação da unidade ativa no menu superior do SIPE para garantir a troca correta
  if (!globalMode && unidadeNomeEsperada) {
    try {
      // Garante que o menu superior carregou completamente antes de inspecionar
      await page.waitForSelector('a[name="btnMudaUnidade"]', { timeout: 10_000 }).catch(() => {})

      let unidadeAtiva = await page.evaluate(() => {
        const el = document.querySelector('a[name="btnMudaUnidade"]') as HTMLAnchorElement | null
        return el ? el.getAttribute('title')?.toUpperCase().trim() || '' : ''
      }).catch(() => '')

      const esperadaClean = unidadeNomeEsperada.toUpperCase().trim()
      log(jobId, `Unidade ativa na sessão SIPE: "${unidadeAtiva}" | Esperada: "${esperadaClean}"`)

      // Se a unidade ativa for vazia (não detectada) ou diferente da esperada, força a troca
      if (!unidadeAtiva || (!unidadeAtiva.includes(esperadaClean) && !esperadaClean.includes(unidadeAtiva))) {
        log(jobId, `⚠️ Unidade divergente ou não detectada! Forçando troca de papel no SIPE para ID #${unidadeId}...`)
        
        // Vai para a tela de seleção de papel
        await page.goto(`${SIPE_URL}/selectRole/1`, { waitUntil: 'domcontentloaded' }).catch(async () => {
          await page.goto(`${SIPE_URL}/selectRole`, { waitUntil: 'domcontentloaded' })
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
          }, unidadeId, { timeout: 15_000 })
        } catch (err) {
          // Fallback se estourar tempo
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
        }
      }
    } catch (err) {
      log(jobId, `⚠️ Falha ao verificar/alterar unidade ativa no menu: ${err}`)
    }
  }

  if (globalMode) {
    log(jobId, `Acessando listagem global cross-unit: ${SIPE_URL}/apenados/index`)
    await page.goto(`${SIPE_URL}/apenados/index`, {
      waitUntil: 'domcontentloaded',
      timeout: 45_000,
    })
    await page.waitForSelector('table', { timeout: 30_000 })
  } else {
    let tableFound = false
    try {
      log(jobId, `Acessando listagem geral: ${SIPE_URL}/listagem/geral`)
      await page.goto(`${SIPE_URL}/listagem/geral`, {
        waitUntil: 'domcontentloaded',
        timeout: 20_000,
      })
      await page.waitForSelector('table', { timeout: 15_000 })
      tableFound = true
    } catch (err) {
      log(jobId, `⚠️ Falha ao carregar listagem geral, tentando carceragem...`)
    }

    if (!tableFound) {
      await page.goto(`${SIPE_URL}/listagem/${unidadeId}/carceragem`, {
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

      // Descobre os índices de código e cela na tabela
      const headers = Array.from(document.querySelectorAll('table thead th, table thead td'))
      const codigoIndex = headers.findIndex(h => {
        const text = (h.textContent ?? '').toUpperCase().trim()
        return text === 'CÓDIGO' || text === 'CODIGO' || text === 'CÓD' || text === 'COD'
      })
      const celaIndex = headers.findIndex(h => (h.textContent ?? '').toUpperCase().trim() === 'CELA')

      const data: any[] = dt.rows().data().toArray()
      return data
        .map((row: any) => {
          let id = NaN
          let cela = ''
          if (Array.isArray(row)) {
            id = parseInt(row[codigoIndex >= 0 ? codigoIndex : 0])
            if (celaIndex >= 0) cela = (row[celaIndex] ?? '').toString().trim()
          } else if (row) {
            id = parseInt(row.id ?? row.sipeId ?? '')
            cela = (row.cela ?? '').toString().trim()
          }
          return { id, cela }
        })
        .filter(item => !isNaN(item.id) && item.id > 0)
    } catch { return [] }
  }).catch(() => [])

  if (apenadosViaApi.length > 0) {
    log(jobId, `⚡ Estratégia A (DataTables JS API): ${apenadosViaApi.length} IDs`)
    for (const item of apenadosViaApi) {
      if (item.cela) listagemInfoCache.set(item.id, { cela: item.cela })
    }
    return [...new Set(apenadosViaApi.map(item => item.id))]
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

      // Descobre os índices de código e cela na tabela
      const headers = Array.from(document.querySelectorAll('table thead th, table thead td'))
      const codigoIndex = headers.findIndex(h => {
        const text = (h.textContent ?? '').toUpperCase().trim()
        return text === 'CÓDIGO' || text === 'CODIGO' || text === 'CÓD' || text === 'COD'
      })
      const celaIndex = headers.findIndex(h => (h.textContent ?? '').toUpperCase().trim() === 'CELA')

      let allRows: any[] = []
      let start = 0
      const length = 500 // Lote seguro e de alto desempenho
      let draw = 1
      let hasMore = true

      // Modo teste: limitar a 3 páginas (~1500 IDs)
      const testMode = (globalThis as any).SCRAPING_TESTE_MODE === true
      const maxPages = testMode ? 3 : Infinity

      while (hasMore) {
        // Se estamos em modo teste e já ultrapassamos o limite, parar
        if (testMode && draw > maxPages) {
          console.log(`[TESTE] Limite de ${maxPages} páginas atingido, parando coleta`)
          hasMore = false
          break
        }

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

        // Se já puxamos tudo ou se o lote atual retornou menos que o solicitado (fim da lista)
        if (allRows.length >= totalRecords || rows.length < length) {
          hasMore = false
        }
      }

      return allRows
        .map((row: any) => {
          let id = NaN
          let cela = ''
          if (Array.isArray(row)) {
            id = parseInt(row[codigoIndex >= 0 ? codigoIndex : 0])
            if (celaIndex >= 0) cela = (row[celaIndex] ?? '').toString().trim()
          } else if (row) {
            id = parseInt(row.id ?? row.sipeId ?? '')
            cela = (row.cela ?? '').toString().trim()
          }
          return { id, cela }
        })
        .filter(item => !isNaN(item.id) && item.id > 0)
    } catch { return [] }
  }, SIPE_URL).catch(() => [])

  if (apenadosViaFetch.length > 0) {
    log(jobId, `⚡ Estratégia B (fetch direto paginado): ${apenadosViaFetch.length} IDs`)
    for (const item of apenadosViaFetch) {
      if (item.cela) listagemInfoCache.set(item.id, { cela: item.cela })
    }
    return [...new Set(apenadosViaFetch.map(item => item.id))]
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

  log(jobId, `🔍 Identificada coluna de IDs na posição (0-index): ${codigoColIndex}`)
  if (celaColIndex >= 0) {
    log(jobId, `🔍 Identificada coluna de CELA na posição (0-index): ${celaColIndex}`)
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

      // Salva a cela correspondente no cache em memória
      if (celaColIndex >= 0 && cells.length > celaColIndex) {
        const celaText = (await cells[celaColIndex].innerText()).trim()
        if (celaText) {
          listagemInfoCache.set(id, { cela: celaText })
        }
      }
    }
  }

  await extractIds()

  let pageNum = 1
  let emptyConsecutivos = 0
  const MAX_VAZIAS = 3
  let continuar = true
  while (continuar) {
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

      if (novos === 0) {
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

  log(jobId, `✅ Total IDs coletados: ${ids.size}`)
  if (ids.size <= 50) {
    log(jobId, `🔍 Todos os IDs: ${[...ids].sort((a, b) => a - b).join(', ')}`)
  } else {
    log(jobId, `🔍 IDs (primeiros 30): ${[...ids].sort((a, b) => a - b).slice(0, 30).join(', ')}`)
  }
  return [...ids]
}

// ── Ficha scraping ────────────────────────────────────────────

async function scrapeApenadoFicha(
  page: Page,
  sipeId: number,
  unidadeNome?: string | null,
  useSearch = false
): Promise<void> {
  if (useSearch) {
    // ── Busca cross-unit: contorna restrição de unidade da sessão ──
    await page.goto(
      `${SIPE_URL}/apenados/index?escolha=nomeapenado&parametro=${sipeId}`,
      { waitUntil: 'domcontentloaded', timeout: 45_000 }
    )

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
    const editResponse = await page.goto(link, { waitUntil: 'domcontentloaded', timeout: 45_000 })

    const editUrl = page.url()
    if (editUrl.includes('/login') || editUrl.includes('/selectRole')) {
      throw new Error('SESSAO_EXPIRADA')
    }

    const editStatus = editResponse?.status()
    if (editStatus && (editStatus === 404 || editStatus === 403 || editStatus === 500)) {
      throw new Error('APENADO_NAO_ENCONTRADO')
    }
  } else {
    // ── Fluxo original: acesso direto por URL ──
    const response = await page.goto(`${SIPE_URL}/apenados/${sipeId}/editar`, {
      waitUntil: 'domcontentloaded',
      timeout: 45_000,
    })

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

    // Detect HTTP errors
    const status = response?.status()
    if (status && (status === 404 || status === 403 || status === 500)) {
      throw new Error('APENADO_NAO_ENCONTRADO')
    }

    // Fast check for not found errors in body text
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

    // Busca textual de contingência para cela, unidade e campos select via regex
    const bodyText = document.body?.innerText || ''

    let celaFicha = null
    const celaMatch = bodyText.match(/Cela:\s*([^\n]+)/i) || bodyText.match(/Cela\s*-\s*([^\n]+)/i)
    if (celaMatch) {
      celaFicha = celaMatch[1].trim()
    }

    let unidadeFicha = null
    const unidadeMatch = bodyText.match(/Unidade:\s*([^\n]+)/i) || bodyText.match(/Estabelecimento:\s*([^\n]+)/i) || bodyText.match(/Unidade\s*Prisional:\s*([^\n]+)/i)
    if (unidadeMatch) {
      unidadeFicha = unidadeMatch[1].trim()
    }

    // Extração via regex para campos que vêm como texto (não selects)
    const extractLabel = (label: string): string | null => {
      const match = bodyText.match(new RegExp(`${label}\\s*[\\n:]*\\s*([^\\n]+)`, 'i'))
      return match ? match[1].trim() : null
    }

    const sexoValue = selVal('sexo') || extractLabel('Sexo')
    const etniaValue = selVal('fk_etnia') || extractLabel('Etnia')
    const estadoCivilValue = selVal('fk_estadocivil') || extractLabel('Estado Civil')
    const grauInstrucaoValue = selVal('fk_grauinstrucao') || extractLabel('Grau\\s+(?:de\\s+)?Instrução')
    const religiaoValue = selVal('fk_religiao') || extractLabel('Religião')
    const situacaoValue = selVal('situacao') || extractLabel('Situação')

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

        // Fallback: se falhou ao obter a foto original limpa (ex: 404), tenta obter a foto original (com proteção/marca d'água)
        if (!base64Data && cleanPhotoSrc !== photoSrc) {
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

  // Recupera cela do cache obtido na listagem (prioridade) ou tenta ler do corpo do perfil
  const cela = listagemInfoCache.get(sipeId)?.cela ?? dados.celaFicha ?? null;
  const unidade = unidadeNome ?? dados.unidadeFicha ?? null;

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

    if (!localApenado.unidade && unidade) {
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
    situacao: dados.situacao,
    dataEntrada: dados.dataEntrada,
    dataPrisao: dados.dataPrisao,
    tempoPena: dados.tempoPena,
    monitorado: dados.monitorado,
    intramuro: dados.intramuro,
    presoOriundo: dados.presoOriundo,
    oficioEntrada: dados.oficioEntrada,
    faccaoId,
    photoPath,
    unidade: unidade || undefined,
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
  // Campos de inteligência NÃO são sobrescritos
  try {
    const apenadoEmAIP = await prisma.aIPApenado.findUnique({
      where: { sipeId }
    })

    if (apenadoEmAIP) {
      await prisma.aIPApenado.update({
        where: { id: apenadoEmAIP.id },
        data: {
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
          // Campos de inteligência NÃO são atualizados aqui
        }
      }).catch((err) => {
        console.error(`[AIP] Erro ao sincronizar ${sipeId}:`, err.message)
      })
    }
  } catch (err) {
    console.error(`[AIP] Erro ao buscar registro em AIP:`, err)
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

    let base64Data = await page.evaluate(async (url) => {
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

    // Fallback: se falhou ao obter a foto original limpa (ex: 404), tenta com a URL original (com proteção/marca d'água)
    if (!base64Data && cleanSrc !== src) {
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
      const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 8000 });
      const status = response?.status();
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
    await page.goto(`${SIPE_URL}/apenados/${sipeId}/incluirProcessos`, { waitUntil: 'domcontentloaded' })
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
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15_000 })
    const status = response?.status()
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
        cpf: v.cpf,
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
    await page.goto(`${SIPE_URL}/apenados/${sipeId}/alcunhas`, { waitUntil: 'domcontentloaded' })
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
  
  await page.goto(`${SIPE_URL}/advogados/listaradvogados`, {
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

async function scrapeAdvogadoDetalhe(page: Page, sipeId: number, jobId?: string): Promise<void> {
  await page.goto(`${SIPE_URL}/advogados/${sipeId}/detalhaclientes`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('body', { timeout: 10_000 })
  const text = await page.innerText('body')

  const nome = text.match(/Nome do Advogado\s+([^\n]+)/)?.[1]?.trim()
  const oab = text.match(/OAB\s+([^\n]+)/)?.[1]?.trim()
  const cpf = text.match(/CPF\s+([0-9./-]+)/)?.[1]?.trim()
  const telefone = text.match(/Telefone de Contato\s+([^\n]+)/)?.[1]?.trim()
  const dataCadastro = text.match(/Data de Cadastro\s+([^\n]+)/)?.[1]?.trim()

  if (!nome) return

  const adv = await prisma.sipeAdvogado.upsert({
    where: { sipeId },
    create: { sipeId, nome, oab, cpf, telefone, dataCadastro },
    update: { nome, oab, cpf, telefone, dataCadastro },
  })

  // Scraping adicional da OAB Nacional via CNA
  if (oab) {
    try {
      await scrapeCnaOabDetails(page, adv.id, oab, jobId)
    } catch (cnaErr) {
      console.error(`[CNA OAB] Falha ao obter dados CNA para o advogado ${nome} (OAB ${oab}):`, cnaErr)
    }
  }

  // Extração estruturada de apenados atendidos a partir do DOM (resolve o rótulo "Cpf" que na verdade é o SIPE ID ou CPF)
  const apenadosAtendidos = await page.evaluate(() => {
    const tabelas = Array.from(document.querySelectorAll('table#simple-table'))
    return tabelas.map(tabela => {
      const ddElements = Array.from(tabela.querySelectorAll('dd'))
      const dtElements = Array.from(tabela.querySelectorAll('dt'))
      
      const getValByDt = (label: string) => {
        const index = dtElements.findIndex(dt => (dt.textContent ?? '').toLowerCase().includes(label.toLowerCase()))
        return index >= 0 && ddElements[index] ? (ddElements[index].textContent ?? '').trim() : ''
      }

      const getHrefByDt = (label: string) => {
        const index = dtElements.findIndex(dt => (dt.textContent ?? '').toLowerCase().includes(label.toLowerCase()))
        if (index >= 0 && ddElements[index]) {
          const a = ddElements[index].querySelector('a')
          return a ? a.getAttribute('href') : null
        }
        return null
      }

      return {
        nome: getValByDt('Nome Apenado'),
        sipeIdText: getValByDt('Cpf'), // O rótulo "Cpf" pode conter na verdade o SIPE ID ou o CPF do apenado
        href: getHrefByDt('Nome Apenado'), // Tenta extrair o link do nome, onde geralmente está o SIPE ID correto
        dataNascimento: getValByDt('Data Nascimento'),
        unidade: getValByDt('Unidade Prisional'),
        cela: getValByDt('Cela'),
        tempoPena: getValByDt('Tempo de Pena')
      }
    }).filter(ap => ap.nome && (ap.sipeIdText || ap.href))
  })

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

    // Tenta encontrar o apenado no banco pelo sipeId se tivermos um válido
    let apenado = null
    if (apenadoSipeId) {
      apenado = await prisma.sipeApenadoImportado.findUnique({
        where: { sipeId: apenadoSipeId }
      })
    }

    // 3. Fallback: Se não encontramos por sipeId, tenta buscar por Nome exato
    if (!apenado && ap.nome) {
      apenado = await prisma.sipeApenadoImportado.findFirst({
        where: { nome: ap.nome }
      })
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
          photoPath: null
        }
      });
    } else {
      if (!localApenado.unidade && ap.unidade) {
        localApenado = await prisma.apenado.update({
          where: { id: localApenado.id },
          data: { unidade: ap.unidade }
        });
      }
    }

    // 4. Se não encontramos o apenado, criamos um registro stub parcial
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
          photoPath: localApenado.photoPath, // Copia a foto do apenado local se existir
          apenadoLocalId: localApenado.id, // Vincula à identificação local
          ultimaSyncAt: new Date()
        }
      })
    } else {
      // Se ele já existe, atualiza informações básicas de cela e unidade se estiverem nulas/vazias
      const updateData: any = {}
      if (!apenado.unidade && ap.unidade) updateData.unidade = ap.unidade
      if (!apenado.cela && ap.cela) updateData.cela = ap.cela
      if (!apenado.tempoPena && ap.tempoPena) updateData.tempoPena = ap.tempoPena
      if (!apenado.dataNascimento && ap.dataNascimento) updateData.dataNascimento = ap.dataNascimento

      if (!apenado.apenadoLocalId) {
        updateData.apenadoLocalId = localApenado.id
      }
      if (!apenado.photoPath && localApenado.photoPath) {
        updateData.photoPath = localApenado.photoPath
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

    // Cria ou ativa o vínculo de atendimento com o advogado
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
        ativo: true
      },
      update: {
        ativo: true
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
  const cnaPage = await page.context().newPage({
    userAgent: getRandomUserAgent()
  })

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

export async function scrapeFaccoes(): Promise<void> {
  const context = await createSession()
  const page = await context.newPage()
  try {
    await login(page, SIPE_UNIDADE)

    let options: { value: string; text: string }[] = []
    let extraido = false
    let erroOriginal: any = null

    console.log('[FACCOES] 🔍 Iniciando scrape de facções...')

    // 1. Acessa /apenados/index para extrair IDs dos apenados listados na unidade
    console.log('[FACCOES] 📄 Acessando /apenados/index...')
    await page.goto(`${SIPE_URL}/apenados/index`, { waitUntil: 'domcontentloaded' })
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
        await page.goto(`${SIPE_URL}/apenados/${apenadoId}/editar`, { waitUntil: 'domcontentloaded', timeout: 15_000 })

        const faccaoIdVal = await page.evaluate(() => {
          const el = document.querySelector('[name="faccao_id"]') as HTMLInputElement | null
          return el ? el.value : null
        })

        console.log(`[FACCOES]   -> faccao_id: "${faccaoIdVal}"`)

        if (faccaoIdVal && faccaoIdVal !== '0' && faccaoIdVal !== '') {
          console.log(`[FACCOES] 🌟 Apenado SIPE ID #${apenadoId} possui facção vinculada! Acessando página /faccao...`)
          
          await page.goto(`${SIPE_URL}/apenados/${apenadoId}/faccao`, { waitUntil: 'load', timeout: 20_000 })
          
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
    const targetUrl = `${SIPE_URL}/apenados/${sipeId}/enderecos`
    const response = await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 15_000 })
    
    // Proteção contra redirecionamentos (ex: login expirado, falta de permissão ou apenado não existente)
    const currentUrl = page.url()
    if (
      currentUrl.includes('/login') ||
      currentUrl === `${SIPE_URL}/` ||
      currentUrl === `${SIPE_URL}` ||
      currentUrl.includes('/selectRole') ||
      currentUrl.includes('/home') ||
      (response && (response.status() === 404 || response.status() === 403 || response.status() === 500))
    ) {
      console.warn(`[scrapeEndereço] Acesso recusado ou redirecionado para ${currentUrl} ao tentar acessar o apenado ${sipeId}`)
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
    await page.goto(`${SIPE_URL}/apenados/${sipeId}/mudarcela`, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('table, .empty-message, body', { timeout: 10_000 })

    const rows = await page.$$('table tbody tr')
    for (const row of rows) {
      const cells = await row.$$('td')
      if (cells.length < 5) continue

      // Cabeçalho da tabela: ["#", "DATA DE MUDANÇA", "MOTIVO DA MUDANÇA", "CELA DE", "CELA PARA"]
      const dataStr = (await cells[1]?.innerText())?.trim()
      const motivo = (await cells[2]?.innerText())?.trim() || ''
      const celaDe = (await cells[3]?.innerText())?.trim() || ''
      const celaPara = (await cells[4]?.innerText())?.trim() || ''

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
      const descricao = `Mudança de cela. De: ${celaDe} | Para: ${celaPara} | Motivo: ${motivo}`

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
        },
        update: {
          descricao,
          datahora,
          cela: celaPara,
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

    // Faz o parser do HTML retornado usando DOMParser na própria página do Playwright
    const movimentacoes = await page.evaluate((htmlString) => {
      const parser = new DOMParser()
      const doc = parser.parseFromString(htmlString, 'text/html')
      const table = doc.querySelector('table')
      if (!table) return []

      const trs = Array.from(table.querySelectorAll('tbody tr, tr'))
      const list: any[] = []

      for (const tr of trs) {
        if (tr.querySelector('th')?.textContent?.trim() === 'Codigo') continue
        if (tr.textContent?.includes('Data Entrada') && tr.textContent?.includes('Data Saída')) continue

        const cells = Array.from(tr.children)
        if (cells.length < 9) continue

        const codigo = cells[0].textContent?.trim() || ''
        const regime = cells[1].textContent?.trim() || ''
        const intramuro = cells[2].textContent?.trim() || ''
        const monitorado = cells[3].textContent?.trim() || ''
        const dataEntrada = cells[4].textContent?.trim() || ''
        const origem = cells[5].textContent?.trim() || ''
        const dataSaida = cells[6].textContent?.trim() || ''
        const destino = cells[7].textContent?.trim() || ''
        const motivo = cells[8].textContent?.trim() || ''

        if (!codigo || codigo === 'Codigo') continue

        list.push({
          codigo,
          regime,
          intramuro,
          monitorado,
          dataEntrada,
          origem,
          dataSaida,
          destino,
          motivo
        })
      }
      return list
    }, postResult.html)

    for (const m of movimentacoes) {
      const dataStr = m.dataEntrada !== '-----' ? m.dataEntrada : (m.dataSaida !== '-----' ? m.dataSaida : null)
      let datahora: Date | null = null

      if (dataStr) {
        try {
          const dateParts = dataStr.split('/')
          if (dateParts.length === 3) {
            datahora = new Date(
              parseInt(dateParts[2]),
              parseInt(dateParts[1]) - 1,
              parseInt(dateParts[0]),
              12, // Meio-dia padrão para normalização
              0
            )
          }
        } catch {
          datahora = new Date(dataStr)
        }
      }

      const tipo = 'MOVIMENTACAO'
      const descricao = `Movimentação Geral - Código: ${m.codigo} | Motivo: ${m.motivo} | Origem: ${m.origem} | Destino: ${m.destino} | Entrada: ${m.dataEntrada} | Saída: ${m.dataSaida} | Regime: ${m.regime} | Intramuro: ${m.intramuro} | Monitorado: ${m.monitorado}`

      const idString = `sipe-mov-${apenadoId}-${m.codigo}`
      const hashId = createHash('md5').update(idString).digest('hex')

      await prisma.sipeHistorico.upsert({
        where: { id: hashId },
        create: {
          id: hashId,
          apenadoId,
          tipo,
          descricao,
          datahora,
          unidade: m.destino !== '-----' ? m.destino : (m.origem !== '-----' ? m.origem : null),
        },
        update: {
          descricao,
          datahora,
          unidade: m.destino !== '-----' ? m.destino : (m.origem !== '-----' ? m.origem : null),
        },
      })
    }
  } catch (err) {
    console.error(`Erro ao sincronizar movimentações da Ficha Geral do apenado ${sipeId}:`, err)
  }
}

async function scrapeDocumentos(
  page: Page,
  sipeId: number,
  apenadoId: string,
): Promise<void> {
  try {
    await page.goto(`${SIPE_URL}/anexos/${sipeId}/index`, { waitUntil: 'domcontentloaded' })
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

      await prisma.sipeDocumento.upsert({
        where: { id: hashId },
        create: {
          id: hashId,
          apenadoId,
          nome,
          tipo,
          dataAnexo: data ? new Date(data) : undefined,
          urlDownload,
        },
        update: {
          tipo,
          dataAnexo: data ? new Date(data) : undefined,
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
      const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 10_000 })
      const status = response?.status()
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

// ── Scraping de Unidades Prisionais ──────────────────────────

export async function scrapeUnidadesPrisionais(jobId?: string): Promise<Array<{ id: string; nome: string }>> {
  if (jobId) {
    await dbProgress(jobId, { fase: 'Login', log: 'Iniciando sessão no SIPE para unidades...' })
  }

  const context = await createSession()
  const page = await context.newPage()

  try {
    if (jobId) {
      await dbProgress(jobId, { log: 'Realizando login no SIPE...' })
    }
    // Faz login usando perfil 'Master' e unidade '3' (fallback)
    await login(page, SIPE_UNIDADE)

    if (jobId) {
      await dbProgress(jobId, { fase: 'Coletando unidades', log: 'Acessando tela de seleção de papéis...' })
    }

    // Navega para /selectRole para garantir que está na tela de seleção
    await page.goto(`${SIPE_URL}/selectRole`, { waitUntil: 'domcontentloaded', timeout: 20_000 }).catch(async () => {
      await page.goto(`${SIPE_URL}/selectRole/1`, { waitUntil: 'domcontentloaded' })
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

// Inicia o scheduler em segundo plano
if (typeof window === 'undefined') {
  setupAutoSyncScheduler()
}
