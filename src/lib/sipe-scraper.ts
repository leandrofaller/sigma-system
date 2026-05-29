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
      // Flags obrigatórias para Docker (sem seccomp/AppArmor por padrão)
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
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
    await page.waitForURL('**/home**', { timeout: 30_000 })
  } catch {
    const url = page.url()
    throw new Error(`Seleção de perfil não redirecionou para /home. URL atual: ${url}`)
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

  runScrape(jobId, unidadeId).catch(async (err) => {
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

  try {
    const ok = await login(page, unidadeId)
    if (!ok) throw new Error('Falha no login do SIPE')

    log(jobId, 'Login realizado com sucesso')

    // ── Phase 1: collect IDs (or load from checkpoint) ────────
    if (job.tipo === 'ADVOGADOS') {
      log(jobId, 'Modo específico: Scraping apenas de Advogados + Atendimentos')
    } else {
      let ids: number[]

      if (job.idsColetados) {
        // Resume: reuse previously collected list
        ids = JSON.parse(job.idsColetados) as number[]
        // Determine which IDs remain (after cursor)
        const cursor = job.ultimoIdProcessado ?? null
        if (cursor !== null) {
          const cursorIndex = ids.indexOf(cursor)
          ids = cursorIndex >= 0 ? ids.slice(cursorIndex + 1) : ids
        }
        const alreadyDone = (job.processado ?? 0)
        refreshMemory(jobId, {
          fase: 'Retomando scraping de apenados...',
          total: (JSON.parse(job.idsColetados) as number[]).length,
          processado: alreadyDone,
          ultimoLog: `Retomando do ID #${cursor ?? 'início'} — ${ids.length} restantes`,
        })
        await dbProgress(jobId, {
          log: `Retomando do ID #${cursor ?? 'início'} — ${ids.length} restantes`,
          fase: 'Retomando',
        })
      } else {
        // Fresh start: collect all IDs
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

        try {
          await withRetry(async () => {
            try {
              await scrapeApenadoFicha(page, sipeId, job.unidadeNome)
            } catch (err: any) {
              if (err?.message === 'SESSAO_EXPIRADA') {
                log(jobId, 'Sessão expirada detectada. Re-autenticando no SIPE...')
                await login(page, unidadeId)
                // Retry loading the profile after logging back in
                await scrapeApenadoFicha(page, sipeId, job.unidadeNome)
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
          const msg = `Erro apenado #${sipeId} (após 3 tentativas): ${err}`
          globalThis.__sipeState!.ultimoLog = msg
          await dbProgress(jobId, { erros: globalThis.__sipeState!.erros, log: msg })
        }
      }

      // Final cursor flush — use the actual last processed ID, not ids[last]
      await dbProgress(jobId, {
        processado: globalThis.__sipeState!.processado,
        ...(lastProcessedId !== undefined ? { ultimoIdProcessado: lastProcessedId } : {}),
      })
    }

    // ── Phase 3: advogados ────────────────────────────────────
    if (job.tipo === 'ADVOGADOS') {
      refreshMemory(jobId, { fase: 'Scraping advogados...' })
      await dbProgress(jobId, { fase: 'Advogados', log: 'Iniciando scraping de advogados...' })
      await scrapeAdvogados(page, jobId)
    }

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

let logPromiseChain = Promise.resolve()

function log(jobId: string, msg: string) {
  if (globalThis.__sipeState) globalThis.__sipeState.ultimoLog = msg
  // Enfileira a escrita de log para evitar condições de corrida no banco de dados
  logPromiseChain = logPromiseChain.then(() => dbProgress(jobId, { log: msg })).catch(() => {})
}

async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn()
    } catch (err: any) {
      if (err?.message === 'APENADO_NAO_ENCONTRADO') {
        throw err
      }
      if (i === attempts - 1) throw err
      await new Promise(r => setTimeout(r, 2000 * (i + 1))) // 2s, 4s, 6s
    }
  }
  throw new Error('unreachable')
}

// Cache temporário para associar dados coletados da listagem geral aos apenados
const listagemInfoCache = new Map<number, { cela?: string }>()

// ── ID collection ─────────────────────────────────────────────

async function coletarIdsApenados(
  page: Page,
  unidadeId: string,
  jobId: string,
  unidadeNomeEsperada?: string | null
): Promise<number[]> {
  // Validação da unidade ativa no menu superior do SIPE para garantir a troca correta
  if (unidadeNomeEsperada) {
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
      await botaoLocator.click()
      await page.waitForTimeout(1000)
      const before = ids.size
      await extractIds()
      const novos = ids.size - before
      log(jobId, `📄 Página ${pageNum}: +${novos} IDs (total: ${ids.size})`)

      if (novos === 0) {
        emptyConsecutivos++
        if (emptyConsecutivos >= MAX_VAZIAS) {
          log(jobId, `📄 ${MAX_VAZIAS} páginas consecutivas sem IDs novos — encerrando`)
          continuar = false
        }
      } else {
        emptyConsecutivos = 0
      }
    } catch {
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
  unidadeNome?: string | null
): Promise<void> {
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

    // Busca textual de contingência para cela e unidade no corpo da página (caso o cache da listagem falhe)
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

    return {
      nome: val('nomeapenado'),
      nomeOutro: val('nomefalso'),
      cpf: val('cpf'),
      rg: val('rg'),
      rgOrgao: val('orgaoexpedidor'),
      dataNascimento: val('datanascimento'),
      naturalidade: val('distrito'),
      sexo: selVal('sexo'),
      etnia: selVal('fk_etnia'),
      orientacaoSexual: selVal('homosexual'),
      tipoSanguineo: selVal('tiposanguineo'),
      grauInstrucao: selVal('fk_grauinstrucao'),
      religiao: selVal('fk_religiao'),
      estadoCivil: selVal('fk_estadocivil'),
      nomeConjuge: val('nomeesposa'),
      qtdFilhos: parseInt(val('qtdfilhos') || '0') || null,
      nomeMae: val('nomemae'),
      nomePai: val('nomepai'),
      telefone: val('telefone'),
      rji: val('rji'),
      regime: val('regime'),
      situacao: selVal('situacao'),
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
  if (dados.faccaoSipeId && dados.faccaoSipeId > 0) {
    const faccao = await prisma.sipeFaccao.findUnique({
      where: { sipeId: dados.faccaoSipeId },
    })
    faccaoId = faccao?.id ?? null
  }

  // --- Extração de Imagem ---
  let photoPath: string | null = null;
  let fotoAtualizada = false;
  try {
    const photoSrc = await page.evaluate(() => {
      const imgs = Array.from(document.querySelectorAll('img'));
      for (const img of imgs) {
        const src = img.src || '';
        const alt = (img.alt || '').toLowerCase();
        const id = (img.id || '').toLowerCase();
        const className = (img.className || '').toLowerCase();
        
        if (
          id.includes('foto') || id.includes('profile') || id.includes('avatar') || id.includes('apenado') ||
          className.includes('foto') || className.includes('profile') || className.includes('avatar') || className.includes('apenado') ||
          alt.includes('foto') || alt.includes('profile') || alt.includes('avatar') || alt.includes('apenado') ||
          src.includes('/foto') || src.includes('/photo') || src.includes('/imagem') || src.includes('/getFoto') || src.includes('/arquivo')
        ) {
          return src;
        }
      }
      
      const containerImg = document.querySelector('.foto, .foto-apenado, .profile-image, #foto img') as HTMLImageElement;
      if (containerImg) return containerImg.src;

      const candidates = imgs.filter(img => {
        const src = (img.src || '').toLowerCase();
        return !src.includes('logo') && !src.includes('sejus') && !src.includes('governo') && !src.includes('brasao') && !src.includes('bandeira') && !src.includes('icon');
      });
      if (candidates.length > 0) {
        return candidates[0].src;
      }
      
      return null;
    });

    if (photoSrc) {
      // Remove o sufixo _fotoUsuario da URL para baixar a imagem original sem o filtro/marca d'água do SIPE
      const cleanPhotoSrc = photoSrc.replace('_fotoUsuario', '');

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

  // Fallback: busca por nome se não encontrou por matricula (compatibilidade)
  if (!localApenado) {
    localApenado = await prisma.apenado.findFirst({
      where: { name: nomeApenadoUpper }
    });
  }

  if (!localApenado) {
    localApenado = await prisma.apenado.create({
      data: {
        name: nomeApenadoUpper,
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
  })

  await Promise.all([
    scrapeProcessos(page, sipeId, apenado.id),
    scrapeAlcunhas(page, sipeId, apenado.id),
    scrapeEndereço(page, sipeId, apenado.id),
    scrapeHistorico(page, sipeId, apenado.id),
    scrapeDocumentos(page, sipeId, apenado.id),
  ])
}

async function scrapeProcessos(
  page: Page,
  sipeId: number,
  apenadoId: string
): Promise<void> {
  try {
    await page.goto(`${SIPE_URL}/apenados/${sipeId}/incluirProcessos`, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('body', { timeout: 10_000 })
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
  } catch { /* ignore */ }
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

async function scrapeAdvogados(page: Page, jobId: string): Promise<void> {
  await page.goto(`${SIPE_URL}/advogados/listaradvogados`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('table', { timeout: 15_000 }).catch(() => {})
  await page.selectOption('select[name*="DataTables_Table"]', '-1').catch(() => {})
  await page.waitForTimeout(1000)

  const linksSet = new Set<string>()
  const linksDetails: { href: string; id: string }[] = []

  const extractLinks = async () => {
    const currentLinks = await page.$$eval(
      'tbody a[href*="/detalhaclientes"]',
      (els: Element[]) =>
        (els as HTMLAnchorElement[]).map((el) => ({
          href: el.getAttribute('href') ?? '',
          id: el.href.match(/\/advogados\/(\d+)\//)?.[1] ?? '',
        }))
    )
    for (const link of currentLinks) {
      if (link.href && link.id && !linksSet.has(link.id)) {
        linksSet.add(link.id)
        linksDetails.push(link)
      }
    }
  }

  await extractLinks()

  // Loop de paginação caso a seleção de '-1' seja ignorada pelo servidor (server-side pagination)
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
      await botaoLocator.click()
      await page.waitForTimeout(1000)
      const before = linksDetails.length
      await extractLinks()
      const novos = linksDetails.length - before
      if (novos === 0) {
        continuar = false
      }
    } catch {
      continuar = false
    }
  }

  log(jobId, `Advogados encontrados para detalhamento: ${linksDetails.length}`)
  if (globalThis.__sipeState) {
    globalThis.__sipeState.fase = 'Sincronizando advogados...'
    globalThis.__sipeState.total = linksDetails.length
    globalThis.__sipeState.processado = 0
    globalThis.__sipeState.pct = 0
  }
  await dbProgress(jobId, {
    total: linksDetails.length,
    processado: 0,
  })

  let idx = 0
  for (const link of linksDetails) {
    if (!link.href || !link.id || globalThis.__sipeStopFlag) continue
    try {
      await scrapeAdvogadoDetalhe(page, parseInt(link.id))
      idx++
      if (globalThis.__sipeState) {
        globalThis.__sipeState.processado = idx
        globalThis.__sipeState.pct = Math.round((idx / linksDetails.length) * 100)
      }
      await dbProgress(jobId, {
        processado: idx,
      })
      await page.waitForTimeout(200 + Math.random() * 300)
    } catch (err) {
      if (globalThis.__sipeState) {
        globalThis.__sipeState.erros++
      }
      const msg = `Erro advogado #${link.id}: ${err}`
      if (globalThis.__sipeState) {
        globalThis.__sipeState.ultimoLog = msg
      }
      await dbProgress(jobId, {
        erros: globalThis.__sipeState?.erros ?? undefined,
        log: msg
      })
    }
  }
}

async function scrapeAdvogadoDetalhe(page: Page, sipeId: number): Promise<void> {
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

    // Tentamos com os primeiros 5 apenados da listagem para evitar casos em que o perfil
    // de um apenado específico não exiba ou não possua acesso ao dropdown de facção.
    for (let i = 0; i < 5; i++) {
      try {
        console.log(`[FACCOES] 📄 Tentativa ${i + 1}/5 - Acessando /apenados/index...`)
        await page.goto(`${SIPE_URL}/apenados/index`, { waitUntil: 'domcontentloaded' })
        await page.waitForSelector('tbody', { timeout: 15_000 }).catch(() => {})
        
        const links = await page.$$('tbody a[href*="/selecionarOpcao"]')
        console.log(`[FACCOES] 🔗 Encontrados ${links.length} links de apenados`)

        if (links.length <= i) {
          console.log(`[FACCOES] ⚠️ Não há link suficiente (precisa de ${i + 1}, tem ${links.length})`)
          break;
        }

        const link = links[i];
        const href = await link.getAttribute('href');
        if (!href) {
          console.log(`[FACCOES] ❌ Link ${i} não tem href`)
          continue;
        }

        const m = href.match(/\/apenados\/(\d+)\//);
        if (!m) {
          console.log(`[FACCOES] ❌ Não conseguiu extrair ID do href: ${href}`)
          continue;
        }

        const apenadoId = parseInt(m[1]);
        console.log(`[FACCOES] ✓ Apenado ID extraído: ${apenadoId}`);

        // Clica no link de seleção para registrar o apenado ativo na sessão do servidor do SIPE
        try {
          console.log(`[FACCOES] 🖱️ Clicando no link do apenado ${apenadoId}...`)
          await link.click();
          console.log(`[FACCOES] ⏳ Aguardando redirecionamento...`)
          await page.waitForTimeout(1500); // Aguarda o redirecionamento/seleção
          console.log(`[FACCOES] ✓ Clique realizado, continuando...`)
        } catch (err) {
          console.log(`[FACCOES] ⚠️ Erro ao clicar no link, continuando mesmo assim`)
          // Fallback silencioso: prossegue mesmo se o clique falhar
        }

        // Tentativa 1: Página dedicada de facção
        try {
          console.log(`[FACCOES] 🔄 Tentativa 1: Acessando /apenados/${apenadoId}/faccao...`)
          await page.goto(`${SIPE_URL}/apenados/${apenadoId}/faccao`, { waitUntil: 'load', timeout: 20_000 })

          // Tenta múltiplos seletores para o select de facção
          // ⚠️ IMPORTANTE: Evitar select:nth-of-type(2) pois pode ser gênero!
          let selectLocator
          const selectors = [
            'select[name="faccao_id"]',
            'select[name*="faccao"]',
            'select[id*="faccao"]',
            'select'  // último recurso: qualquer select
          ]

          for (const sel of selectors) {
            try {
              const elem = page.locator(sel).first()
              await elem.waitFor({ state: 'attached', timeout: 8_000 })

              // 🔍 Verificar se é realmente de facção (não gênero/sexo)
              const testOptions = await elem.locator('option').evaluateAll((opts: HTMLOptionElement[]) =>
                opts
                  .filter((o) => o.value && o.value !== '0' && o.value !== '')
                  .map((o) => o.textContent?.trim() ?? '')
              )

              console.log(`[FACCOES] 🔎 Seletor "${sel}" encontrado com opções: ${testOptions.slice(0, 3).join(', ')}`)

              // ⚠️ Descartar select de gênero
              const hasGender = testOptions.some(opt =>
                opt.toLowerCase().includes('masculino') ||
                opt.toLowerCase().includes('feminino') ||
                opt.toLowerCase().includes('não informado')
              )

              if (hasGender) {
                console.log(`[FACCOES] ⚠️ "${sel}" é select de gênero (tem Masculino/Feminino), descartando...`)
                continue // Pula este seletor
              }

              // ✅ Este é o select certo de facção
              selectLocator = elem
              console.log(`[FACCOES] ✅ Select de FACÇÃO encontrado com seletor: ${sel}`)
              break
            } catch (err) {
              console.log(`[FACCOES] ⚠️ Seletor "${sel}" falhou: ${(err as any)?.message?.substring(0, 50)}`)
              // tenta próximo seletor
            }
          }

          if (!selectLocator) {
            throw new Error('Nenhum select de facção encontrado (todos rejeitados ou não encontrados)')
          }

          await selectLocator.waitFor({ state: 'attached', timeout: 8_000 })

          console.log(`[FACCOES] ✓ Select de facção confirmado`)

          options = await selectLocator.locator('option').evaluateAll((opts: HTMLOptionElement[]) =>
            opts
              .filter((o) => o.value && o.value !== '0' && o.value !== '')
              .map((o) => ({ value: o.value, text: o.textContent?.trim() ?? '' }))
          )

          console.log(`[FACCOES] 📊 Facções encontradas: ${options.length}`)
          if (options.length > 0) {
            console.log(`[FACCOES] 📋 Primeiras: ${options.slice(0, 3).map(o => o.text).join(', ')}`)
          }

          // ✅ Validação final: não deve ter gênero
          const hasGenderInFinal = options.some(opt =>
            opt.text.toLowerCase().includes('masculino') ||
            opt.text.toLowerCase().includes('feminino')
          )

          if (hasGenderInFinal) {
            throw new Error('Select contém gênero (Masculino/Feminino), não é facção!')
          }

          if (options.length > 0) {
            console.log(`[FACCOES] ✅ Sucesso na tentativa 1!`)
            extraido = true;
            break; // Sucesso: sai do loop de apenados
          }
        } catch (err) {
          console.log(`[FACCOES] ❌ Erro na tentativa 1: ${(err as any)?.message?.substring(0, 100)}`)
          erroOriginal = err;
        }

        // Tentativa 2: Página de edição cadastral (Fallback)
        if (!extraido) {
          try {
            console.log(`[FACCOES] 🔄 Tentativa 2: Acessando /apenados/${apenadoId}/editar...`)
            await page.goto(`${SIPE_URL}/apenados/${apenadoId}/editar`, { waitUntil: 'domcontentloaded', timeout: 15_000 })

            // Tenta múltiplos seletores para o select de facção
            // ⚠️ IMPORTANTE: Evitar select:nth-of-type pois pode ser gênero!
            let selectLocator
            const selectors = [
              'select[name="faccao_id"]',
              'select[name*="faccao"]',
              'select[id*="faccao"]',
              'select'  // último recurso
            ]

            for (const sel of selectors) {
              try {
                const elem = page.locator(sel).first()
                await elem.waitFor({ state: 'attached', timeout: 8_000 })

                // 🔍 Verificar se é realmente de facção (não gênero/sexo)
                const testOptions = await elem.locator('option').evaluateAll((opts: HTMLOptionElement[]) =>
                  opts
                    .filter((o) => o.value && o.value !== '0' && o.value !== '')
                    .map((o) => o.textContent?.trim() ?? '')
                )

                console.log(`[FACCOES] 🔎 Seletor "${sel}" encontrado com opções: ${testOptions.slice(0, 3).join(', ')}`)

                // ⚠️ Descartar select de gênero
                const hasGender = testOptions.some(opt =>
                  opt.toLowerCase().includes('masculino') ||
                  opt.toLowerCase().includes('feminino') ||
                  opt.toLowerCase().includes('não informado')
                )

                if (hasGender) {
                  console.log(`[FACCOES] ⚠️ "${sel}" é select de gênero, descartando...`)
                  continue // Pula este seletor
                }

                // ✅ Este é o select certo de facção
                selectLocator = elem
                console.log(`[FACCOES] ✅ Select de FACÇÃO encontrado na página de edição com seletor: ${sel}`)
                break
              } catch (err) {
                console.log(`[FACCOES] ⚠️ Seletor "${sel}" falhou na página de edição`)
                // tenta próximo seletor
              }
            }

            if (!selectLocator) {
              throw new Error('Nenhum select de facção encontrado na página de edição')
            }

            await selectLocator.waitFor({ state: 'attached', timeout: 8_000 })

            options = await selectLocator.locator('option').evaluateAll((opts: HTMLOptionElement[]) =>
              opts
                .filter((o) => o.value && o.value !== '0' && o.value !== '')
                .map((o) => ({ value: o.value, text: o.textContent?.trim() ?? '' }))
            )

            console.log(`[FACCOES] 📊 Facções encontradas: ${options.length}`)
            if (options.length > 0) {
              console.log(`[FACCOES] 📋 Primeiras: ${options.slice(0, 3).map(o => o.text).join(', ')}`)
            }

            // ✅ Validação final: não deve ter gênero
            const hasGenderInFinal = options.some(opt =>
              opt.text.toLowerCase().includes('masculino') ||
              opt.text.toLowerCase().includes('feminino')
            )

            if (hasGenderInFinal) {
              throw new Error('Select contém gênero, não é facção!')
            }

            if (options.length > 0) {
              console.log(`[FACCOES] ✅ Sucesso na tentativa 2!`)
              extraido = true;
              break; // Sucesso: sai do loop de apenados
            }
          } catch (err) {
            console.log(`[FACCOES] ⚠️ Erro na tentativa 2, continuando...`)
            // Ignora erro e tenta o próximo apenado
          }
        }
      } catch (err) {
        // Se houver algum erro grave no loop de indexação, tenta o próximo
      }
    }

    if (!extraido) {
      const errMsg = `Não foi possível carregar a lista de facções em nenhum dos primeiros 5 apenados da lista. ` +
        `Erro original na página /faccao do último apenado testado: ${(erroOriginal as any)?.message || erroOriginal}`
      console.log(`[FACCOES] ❌ ${errMsg}`)
      throw new Error(errMsg)
    }

    console.log(`[FACCOES] 💾 Salvando ${options.length} facções no banco...`)

    let count = 0
    for (const opt of options) {
      const id = parseInt(opt.value)
      if (isNaN(id)) continue
      await prisma.sipeFaccao.upsert({
        where: { sipeId: id },
        create: { sipeId: id, nome: opt.text },
        update: { nome: opt.text },
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
    await page.goto(`${SIPE_URL}/apenados/${sipeId}/endereco`, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('[name="logradouro"], body', { timeout: 10_000 })

    const endereco = await page.evaluate(() => {
      const val = (name: string) =>
        (
          document.querySelector(`[name="${name}"]`) as HTMLInputElement | null
        )?.value?.trim() || null

      return {
        logradouro: val('logradouro'),
        numero: val('numero'),
        complemento: val('complemento'),
        bairro: val('bairro'),
        cidade: val('cidade'),
        uf: val('uf'),
        cep: val('cep'),
      }
    })

    // Atualizar apenado com endereço
    await prisma.sipeApenadoImportado.update({
      where: { id: apenadoId },
      data: {
        logradouro: endereco.logradouro,
        numero: endereco.numero,
        complemento: endereco.complemento,
        bairro: endereco.bairro,
        cidade: endereco.cidade,
        uf: endereco.uf,
        cep: endereco.cep,
      },
    })
  } catch (err) {
    // Silently ignore if page doesn't exist
  }
}

async function scrapeHistorico(
  page: Page,
  sipeId: number,
  apenadoId: string,
): Promise<void> {
  try {
    await page.goto(`${SIPE_URL}/apenados/${sipeId}/movimentacoes`, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('table, .empty-message, body', { timeout: 10_000 })

    const rows = await page.$$('table tbody tr')
    for (const row of rows) {
      const cells = await row.$$('td')
      if (cells.length < 2) continue

      const tipo = (await cells[0]?.innerText())?.trim() || 'MOVIMENTACAO'
      const data = (await cells[1]?.innerText())?.trim()
      const descricao = (await cells[2]?.innerText())?.trim() || ''

      if (!data) continue

      await prisma.sipeHistorico.upsert({
        where: {
          // Usar combinação unique já que não há ID único no SIPE
          id: `${apenadoId}-${tipo}-${data}-${descricao}`.substring(0, 50),
        },
        create: {
          apenadoId,
          tipo,
          descricao,
          datahora: new Date(data),
        },
        update: {
          descricao,
          datahora: new Date(data),
        },
      })
    }
  } catch (err) {
    // Silently ignore if page doesn't exist
  }
}

async function scrapeDocumentos(
  page: Page,
  sipeId: number,
  apenadoId: string,
): Promise<void> {
  try {
    await page.goto(`${SIPE_URL}/apenados/${sipeId}/documentos`, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('table, .empty-message, body', { timeout: 10_000 })

    const rows = await page.$$('table tbody tr')
    for (const row of rows) {
      const cells = await row.$$('td')
      if (cells.length < 1) continue

      const nome = (await cells[0]?.innerText())?.trim() || ''
      const tipo = (await cells[1]?.innerText())?.trim() || 'DOCUMENTO'
      const data = (await cells[2]?.innerText())?.trim()

      if (!nome) continue

      await prisma.sipeDocumento.upsert({
        where: {
          // Usar combinação única
          id: `${apenadoId}-${nome}-${data}`.substring(0, 50),
        },
        create: {
          apenadoId,
          nome,
          tipo,
          dataAnexo: data ? new Date(data) : undefined,
        },
        update: {
          tipo,
          dataAnexo: data ? new Date(data) : undefined,
        },
      })
    }
  } catch (err) {
    // Silently ignore if page doesn't exist
  }
}

export async function closeBrowser(): Promise<void> {
  if (browserInstance) {
    await browserInstance.close()
    browserInstance = null
  }
}
