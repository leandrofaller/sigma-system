/**
 * SIPE Scraper — Playwright-based crawler for sipe.sejus.ro.gov.br
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

  // Seleciona perfil e unidade
  await page.waitForSelector('select', { timeout: 10_000 })
  await page.selectOption('select:first-of-type', SIPE_PERFIL)
  await page.selectOption('select:last-of-type', unidadeId)

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

      ids = await coletarIdsApenados(page, unidadeId, jobId)

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
        await scrapeApenadoFicha(page, sipeId)
        lastProcessedId = sipeId
        globalThis.__sipeState!.processado++
        globalThis.__sipeState!.pct = globalThis.__sipeState!.total
          ? Math.round(
              (globalThis.__sipeState!.processado / globalThis.__sipeState!.total) * 100
            )
          : 0

        // Persist cursor every 5 records (reduce DB load)
        if (globalThis.__sipeState!.processado % 5 === 0) {
          await dbProgress(jobId, {
            processado: globalThis.__sipeState!.processado,
            ultimoIdProcessado: sipeId,
          })
        }
        // Polite delay
        await page.waitForTimeout(300 + Math.random() * 500)
      } catch (err) {
        globalThis.__sipeState!.erros++
        const msg = `Erro apenado #${sipeId}: ${err}`
        globalThis.__sipeState!.ultimoLog = msg
        await dbProgress(jobId, { erros: globalThis.__sipeState!.erros, log: msg })
      }
    }

    // Final cursor flush — use the actual last processed ID, not ids[last]
    await dbProgress(jobId, {
      processado: globalThis.__sipeState!.processado,
      ...(lastProcessedId !== undefined ? { ultimoIdProcessado: lastProcessedId } : {}),
    })

    // ── Phase 3: advogados ────────────────────────────────────
    refreshMemory(jobId, { fase: 'Scraping advogados...' })
    await dbProgress(jobId, { fase: 'Advogados', log: 'Iniciando scraping de advogados...' })
    await scrapeAdvogados(page, jobId)

    // ── Done ──────────────────────────────────────────────────
    const summary =
      `Concluído: ${globalThis.__sipeState!.processado} apenados processados, ` +
      `${globalThis.__sipeState!.erros} erros`

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

function log(jobId: string, msg: string) {
  if (globalThis.__sipeState) globalThis.__sipeState.ultimoLog = msg
  // Fire-and-forget DB log (no await to keep scraping fast)
  dbProgress(jobId, { log: msg }).catch(() => {})
}

// ── ID collection ─────────────────────────────────────────────

async function coletarIdsApenados(
  page: Page,
  unidadeId: string,
  jobId: string
): Promise<number[]> {
  const ids = new Set<number>()

  await page.goto(`${SIPE_URL}/listagem/${unidadeId}/carceragem`, {
    waitUntil: 'networkidle',
  })

  // Show all rows
  await page
    .selectOption('select[name*="DataTables_Table"]', '-1')
    .catch(() => {})
  await page.waitForTimeout(1000)

  const extractIds = async () => {
    const rows = await page.$$('table tbody tr')
    for (const row of rows) {
      const cell = await row.$('th, td:first-child')
      if (!cell) continue
      const id = parseInt((await cell.innerText()).trim())
      if (!isNaN(id)) ids.add(id)
    }
  }

  await extractIds()
  log(jobId, `IDs principais: ${ids.size}`)

  // Also iterate per-cell links
  const carcLinks = await page.$$eval(
    'a[href*="/fichaCela"]',
    (els) => els.map((el) => (el as HTMLAnchorElement).getAttribute('href'))
  )

  for (const url of carcLinks) {
    if (!url) continue
    try {
      await page.goto(`${SIPE_URL}${url}`, { waitUntil: 'networkidle' })
      await page
        .selectOption('select[name*="DataTables_Table"]', '-1')
        .catch(() => {})
      await page.waitForTimeout(400)
      await extractIds()
    } catch {
      // ignore individual cell errors
    }
  }

  log(jobId, `Total IDs coletados: ${ids.size}`)
  return [...ids]
}

// ── Ficha scraping ────────────────────────────────────────────

async function scrapeApenadoFicha(page: Page, sipeId: number): Promise<void> {
  await page.goto(`${SIPE_URL}/apenados/${sipeId}/editar`, {
    waitUntil: 'networkidle',
  })

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
  ])
}

async function scrapeProcessos(
  page: Page,
  sipeId: number,
  apenadoId: string
): Promise<void> {
  try {
    await page.goto(`${SIPE_URL}/apenados/${sipeId}/incluirProcessos`, {
      waitUntil: 'networkidle',
    })
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
    await page.goto(`${SIPE_URL}/apenados/${sipeId}/alcunhas`, {
      waitUntil: 'networkidle',
    })
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
  await page.goto(`${SIPE_URL}/advogados/listaradvogados`, {
    waitUntil: 'networkidle',
  })
  await page.selectOption('select[name*="DataTables_Table"]', '-1').catch(() => {})
  await page.waitForTimeout(1000)

  const links = await page.$$eval(
    'tbody a[href*="/detalhaclientes"]',
    (els) =>
      (els as HTMLAnchorElement[]).map((el) => ({
        href: el.getAttribute('href'),
        id: el.href.match(/\/advogados\/(\d+)\//)?.[1],
      }))
  )

  log(jobId, `Advogados encontrados: ${links.length}`)
  if (globalThis.__sipeState) {
    globalThis.__sipeState.fase = `Scraping advogados (${links.length})`
  }

  for (const link of links) {
    if (!link.href || !link.id || globalThis.__sipeStopFlag) continue
    try {
      await scrapeAdvogadoDetalhe(page, parseInt(link.id))
      await page.waitForTimeout(200 + Math.random() * 300)
    } catch (err) {
      log(jobId, `Erro advogado #${link.id}: ${err}`)
    }
  }
}

async function scrapeAdvogadoDetalhe(page: Page, sipeId: number): Promise<void> {
  await page.goto(`${SIPE_URL}/advogados/${sipeId}/detalhaclientes`, {
    waitUntil: 'networkidle',
  })
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

  const blocos = text.split('Informações do Apenado').slice(1)
  for (const bloco of blocos) {
    const nomeApenado = bloco.match(/Nome Apenado\s+([^\n]+)/)?.[1]?.trim()
    const cpfApenado = bloco.match(/Cpf\s+([^\n]+)/)?.[1]?.trim()
    if (!nomeApenado) continue

    const importado =
      (cpfApenado
        ? await prisma.sipeApenadoImportado.findFirst({ where: { cpf: cpfApenado } })
        : null) ??
      (await prisma.sipeApenadoImportado.findFirst({
        where: { nome: nomeApenado },
      }))

    if (importado) {
      await prisma.sipeVinculoAdvogado.upsert({
        where: {
          apenadoId_advogadoId: {
            apenadoId: importado.id,
            advogadoId: adv.id,
          },
        },
        create: { apenadoId: importado.id, advogadoId: adv.id },
        update: { ativo: true },
      })
    }
  }
}

// ── Facções ───────────────────────────────────────────────────

export async function scrapeFaccoes(): Promise<void> {
  const context = await createSession()
  const page = await context.newPage()
  try {
    await login(page, SIPE_UNIDADE)

    await page.goto(`${SIPE_URL}/apenados/index`, { waitUntil: 'networkidle' })
    const firstLink = await page.$('tbody a[href*="/selecionarOpcao"]')
    if (!firstLink) return

    const href = await firstLink.getAttribute('href')
    if (!href) return
    const m = href.match(/\/apenados\/(\d+)\//)
    if (!m) return

    await page.goto(`${SIPE_URL}/apenados/${parseInt(m[1])}/faccao`, {
      waitUntil: 'networkidle',
    })

    const options = await page.$$eval(
      'select option',
      (opts) =>
        (opts as HTMLOptionElement[])
          .filter((o) => o.value && o.value !== '0' && o.value !== '')
          .map((o) => ({ value: o.value, text: o.textContent?.trim() ?? '' }))
    )

    for (const opt of options) {
      const id = parseInt(opt.value)
      if (isNaN(id)) continue
      await prisma.sipeFaccao.upsert({
        where: { sipeId: id },
        create: { sipeId: id, nome: opt.text },
        update: { nome: opt.text },
      })
    }
  } finally {
    await context.close()
  }
}

export async function closeBrowser(): Promise<void> {
  if (browserInstance) {
    await browserInstance.close()
    browserInstance = null
  }
}
