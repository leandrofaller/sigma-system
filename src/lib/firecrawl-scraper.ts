/**
 * SIPE Scraper — Firecrawl-based crawler for sipe.sejus.ro.gov.br
 *
 * SYSTEM 2 (ALTERNATIVE): Completely independent from Playwright scraper
 * - Uses Firecrawl (self-hosted at localhost:3002 or API)
 * - Saves to same DB tables (sipeApenadoImportado, aIPApenado)
 * - Can be selected via ?engine=firecrawl query parameter
 *
 * LAST UPDATED: 2026-06-03 - Initial implementation
 */

import FirecrawlApp from 'firecrawl'
import { prisma } from './db'
import sharp from 'sharp'
import { join } from 'path'
import { getApenadosDir } from './storage'
import { createHash } from 'crypto'

// ── Config ────────────────────────────────────────────────────
const SIPE_URL = 'https://sipe.sejus.ro.gov.br'

// Credentials from env (same as Playwright)
const SIPE_CPF = process.env.SIPE_CPF ?? ''
const SIPE_SENHA = process.env.SIPE_SENHA ?? ''
const SIPE_PERFIL = process.env.SIPE_PERFIL ?? '2'
const SIPE_UNIDADE = process.env.SIPE_UNIDADE ?? '3'

// Firecrawl config
const FIRECRAWL_MODE = process.env.FIRECRAWL_MODE ?? 'self-hosted'
const FIRECRAWL_BASE_URL = process.env.FIRECRAWL_BASE_URL ?? 'http://localhost:3002'
const FIRECRAWL_API_KEY = process.env.FIRECRAWL_API_KEY ?? ''
const FIRECRAWL_API_URL = process.env.FIRECRAWL_API_URL ?? 'https://api.firecrawl.dev'
const FIRECRAWL_TIMEOUT = parseInt(process.env.FIRECRAWL_TIMEOUT ?? '45000')

// ── Shared state (use same globalThis from sipe-scraper.ts) ──
// Import from sipe-scraper instead of redefining

export async function runScrapeFirecrawl(
  jobId: string,
  unidadeId: string
): Promise<void> {
  const job = await prisma.sipeSyncJob.findUnique({ where: { id: jobId } })
  if (!job) throw new Error('Job não encontrado')

  // Initialize Firecrawl client
  let firecrawlApp: FirecrawlApp
  try {
    if (FIRECRAWL_MODE === 'api') {
      firecrawlApp = new FirecrawlApp({
        apiKey: FIRECRAWL_API_KEY,
        apiUrl: FIRECRAWL_API_URL,
      })
    } else {
      // Self-hosted mode
      firecrawlApp = new FirecrawlApp({
        apiKey: 'localhost', // Dummy key for self-hosted
        apiUrl: FIRECRAWL_BASE_URL,
      })
    }
  } catch (err) {
    throw new Error(`Erro ao inicializar Firecrawl: ${err}`)
  }

  const credentials = { username: SIPE_CPF, password: SIPE_SENHA }
  const loginUnidade = (unidadeId === 'EXTRAMUROS' || unidadeId === 'GLOBAL') ? '3' : unidadeId

  try {
    await updateProgress(jobId, {
      log: 'Iniciando scraping com Firecrawl...',
      fase: 'Login',
    })

    // Phase 1: Collect IDs (or load from checkpoint)
    let ids: number[] = []

    if (job.idsColetados) {
      ids = JSON.parse(job.idsColetados) as number[]
      const cursor = job.ultimoIdProcessado ?? null
      if (cursor !== null) {
        const cursorIndex = ids.indexOf(cursor)
        ids = cursorIndex >= 0 ? ids.slice(cursorIndex + 1) : ids
      }
      const alreadyDone = (job.processado ?? 0)
      const isManual = job.tipo === 'IDS_MANUAIS'

      await updateProgress(jobId, {
        log: isManual
          ? `${ids.length} ID(s) para scraping: ${ids.slice(0, 5).join(', ')}${ids.length > 5 ? '...' : ''}`
          : `Retomando do ID #${cursor ?? 'início'} — ${ids.length} restantes`,
        fase: isManual ? 'Scraping por IDs manuais' : 'Retomando',
      })
    } else {
      // Fresh start: collect IDs
      await updateProgress(jobId, {
        fase: 'Coletando IDs',
        log: 'Coletando lista de apenados com Firecrawl...',
      })

      ids = await coletarIdsApenadosFirecrawl(
        firecrawlApp,
        credentials,
        loginUnidade,
        unidadeId,
        jobId
      )

      await updateProgress(jobId, {
        idsColetados: JSON.stringify(ids),
        total: ids.length,
        log: `${ids.length} apenados encontrados — iniciando scraping`,
        fase: 'Scraping apenados',
      })
    }

    // Phase 2: Scrape each profile
    let lastProcessedId: number | undefined
    for (const sipeId of ids) {
      if (globalThis.__sipeStopFlag) {
        await updateProgress(jobId, {
          status: 'INTERRUPTED',
          finalizadoEm: new Date(),
          log: 'Sincronização interrompida pelo usuário',
        })
        return
      }

      try {
        await scrapeApenadoFichaFirecrawl(
          firecrawlApp,
          sipeId,
          unidadeId,
          credentials,
          jobId
        )

        lastProcessedId = sipeId
        if (globalThis.__sipeState) {
          globalThis.__sipeState.processado++
          globalThis.__sipeState.pct = globalThis.__sipeState.total
            ? Math.round((globalThis.__sipeState.processado / globalThis.__sipeState.total) * 100)
            : 0
        }

        await updateProgress(jobId, {
          processado: globalThis.__sipeState?.processado ?? 0,
          ultimoIdProcessado: sipeId,
        })

        // Polite delay
        await new Promise(resolve => setTimeout(resolve, 300 + Math.random() * 500))
      } catch (err) {
        if (globalThis.__sipeState) {
          globalThis.__sipeState.erros++
        }
        const msg = `Erro apenado #${sipeId}: ${err}`
        if (globalThis.__sipeState) {
          globalThis.__sipeState.ultimoLog = msg
        }
        await updateProgress(jobId, {
          erros: globalThis.__sipeState?.erros ?? 0,
          log: msg,
        })
      }
    }

    // Complete
    await updateProgress(jobId, {
      status: 'COMPLETED',
      finalizadoEm: new Date(),
      log: `Scraping concluído: ${globalThis.__sipeState?.processado ?? 0} apenados processados`,
    })
    globalThis.__sipeStopFlag = false

  } catch (err) {
    await updateProgress(jobId, {
      status: 'FAILED',
      finalizadoEm: new Date(),
      log: `Erro geral no scraping: ${err}`,
    })
    globalThis.__sipeStopFlag = false
    throw err
  }
}

/**
 * Collect apenado IDs using Firecrawl
 */
async function coletarIdsApenadosFirecrawl(
  app: FirecrawlApp,
  credentials: { username: string; password: string },
  loginUnidade: string,
  unidadeId: string,
  jobId: string
): Promise<number[]> {
  try {
    // First, do login to establish session
    const loginUrl = `${SIPE_URL}/login`
    const loginResponse = (await app.scrapeUrl(loginUrl, {
      formats: ['html'],
      timeout: FIRECRAWL_TIMEOUT,
    })) as any

    if (!loginResponse.success) {
      throw new Error('Falha ao acessar página de login')
    }

    // For now, we'll use a simpler approach: fetch the apenados index directly
    // Firecrawl will need to handle cookies/session automatically
    const indexUrl = unidadeId === 'GLOBAL'
      ? `${SIPE_URL}/apenados/index`
      : `${SIPE_URL}/apenados/index?unidade=${unidadeId}`

    const indexResponse = (await app.scrapeUrl(indexUrl, {
      formats: ['html'],
      timeout: FIRECRAWL_TIMEOUT,
    })) as any

    if (!indexResponse.success) {
      throw new Error('Falha ao coletar apenados')
    }

    // Extract IDs from HTML
    const ids = extractIdsFromHtml(indexResponse.html || '')
    return ids
  } catch (err) {
    throw new Error(`Erro ao coletar IDs com Firecrawl: ${err}`)
  }
}

/**
 * Scrape single apenado using Firecrawl
 */
async function scrapeApenadoFichaFirecrawl(
  app: FirecrawlApp,
  sipeId: number,
  unidade: string,
  credentials: { username: string; password: string },
  jobId: string
): Promise<void> {
  try {
    const url = `${SIPE_URL}/apenados/${sipeId}/editar`

    const response = (await app.scrapeUrl(url, {
      formats: ['html'],
      timeout: FIRECRAWL_TIMEOUT,
    })) as any

    if (!response.success) {
      throw new Error(`APENADO_NAO_ENCONTRADO`)
    }

    // Extract data from HTML
    const dados = extractApenadoData(response.html || '')

    // Resolve faccao if exists
    let faccaoId: string | null = null
    if (dados.faccaoSipeId && dados.faccaoSipeId > 0) {
      const faccao = await prisma.sipeFaccao.findUnique({
        where: { sipeId: dados.faccaoSipeId },
      })
      faccaoId = faccao?.id ?? null
    }

    // FIX: Para GLOBAL scraping, usar unidade extraída do HTML como fallback
    // Se não encontrar "Unidade:", tenta usar "cela" (que contém o nome da unidade prisional)
    const resolvedUnidade = unidade || dados.unidadeFicha || dados.celaFicha || undefined

    // DEBUG: Log para verificar qual fallback foi usado
    if (!unidade) {
      if (dados.unidadeFicha) {
        console.log(`[FIRECRAWL] ✅ GLOBAL fallback (unidadeFicha) - Apenado #${sipeId}: => "${resolvedUnidade}"`)
      } else if (dados.celaFicha) {
        console.log(`[FIRECRAWL] ✅ GLOBAL fallback (celaFicha) - Apenado #${sipeId}: => "${resolvedUnidade}"`)
      } else {
        console.log(`[FIRECRAWL] ⚠️ GLOBAL sem fallback - Apenado #${sipeId}: nenhuma unidade encontrada`)
      }
    }

    // Prepare upsert data
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
      unidade: resolvedUnidade,
      ultimaSyncAt: new Date(),
    }

    // Upsert to DB
    const apenado = await prisma.sipeApenadoImportado.upsert({
      where: { sipeId },
      create: { sipeId, ...upsertData },
      update: upsertData,
      include: { faccao: true }
    })

    // Sync with AIP if exists, or create if not
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
        regime: apenado.regime,
        situacao: apenado.situacao,
        dataEntrada: apenado.dataEntrada,
        dataPrisao: apenado.dataPrisao,
        tempoPena: apenado.tempoPena,
        monitorado: apenado.monitorado,
        intramuro: apenado.intramuro,
        presoOriundo: apenado.presoOriundo,
        oficioEntrada: apenado.oficioEntrada,
        faccao: apenado.faccao?.nome || null,
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
        })
        console.log(`[FIRECRAWL-AIP] ✅ Apenado #${sipeId} atualizado em AIP (unidade="${aipSyncData.unidade}")`)
      }
      // REMOVIDO: Criação automática de registros em AIP durante scraping
      // Apenas usuários podem cadastrar apenados em AIP manualmente via botão "Cadastrar em AIP"
    } catch (err) {
      console.error(`Erro ao sincronizar com AIP para apenado #${sipeId}:`, err)
    }

  } catch (err) {
    throw err
  }
}

/**
 * Extract apenado IDs from HTML list
 */
function extractIdsFromHtml(html: string): number[] {
  const ids: number[] = []

  // Look for links in the format /apenados/123/editar
  const regex = /\/apenados\/(\d+)\/editar/g
  let match

  while ((match = regex.exec(html)) !== null) {
    const id = parseInt(match[1])
    if (!ids.includes(id)) {
      ids.push(id)
    }
  }

  return ids
}

/**
 * Extract apenado data from HTML form
 */
function extractApenadoData(html: string) {
  // Simple HTML parser - extract form values
  const extractValue = (name: string): string | null => {
    const regex = new RegExp(`<input[^>]*name=["']${name}["'][^>]*value=["']([^"']*)[^>]*>`, 'i')
    const match = html.match(regex)
    return match ? match[1].trim() : null
  }

  const extractSelect = (name: string): string | null => {
    const regex = new RegExp(
      `<select[^>]*name=["']${name}["'][^>]*>.*?<option[^>]*selected[^>]*>([^<]*)</option>`,
      'is'
    )
    const match = html.match(regex)
    return match ? match[1].trim() : null
  }

  // Extract unidade from text (for GLOBAL scraping fallback)
  const extractLabel = (label: string): string | null => {
    // Padrão 1: "Label : Valor" ou "Label Valor" (mesmo na linha)
    let match = html.match(new RegExp(`${label}\\s*:?\\s*([^\\n<]+)`, 'i'))
    if (match) {
      const value = match[1].trim()
      if (value && value.length > 0 && !value.match(/^[\s•\-–—]+$/)) {
        return value
      }
    }
    return null
  }

  // Extract unidade from text
  let unidadeFicha = null
  const unidadeMatch = html.match(/Unidade:\s*([^\n<]+)/i) ||
                       html.match(/Estabelecimento:\s*([^\n<]+)/i) ||
                       html.match(/Unidade\s*Prisional:\s*([^\n<]+)/i)
  if (unidadeMatch) {
    unidadeFicha = unidadeMatch[1].trim()
  }

  // Extract cela from text
  let celaFicha = null
  const celaMatch = html.match(/Cela:\s*([^\n<]+)/i) ||
                    html.match(/Cela\s*-\s*([^\n<]+)/i)
  if (celaMatch) {
    celaFicha = celaMatch[1].trim()
  }

  return {
    nome: extractValue('nomeapenado'),
    nomeOutro: extractValue('nomefalso'),
    cpf: extractValue('cpf'),
    rg: extractValue('rg'),
    rgOrgao: extractValue('orgaoexpedidor'),
    dataNascimento: extractValue('datanascimento'),
    naturalidade: extractValue('distrito'),
    sexo: extractSelect('sexo') || extractLabel('Sexo') || extractLabel('Gênero'),
    etnia: extractSelect('fk_etnia') || extractLabel('Etnia'),
    orientacaoSexual: extractSelect('homosexual') || extractLabel('Orientação Sexual'),
    tipoSanguineo: extractSelect('tiposanguineo') || extractLabel('Tipo Sanguíneo'),
    grauInstrucao: extractSelect('fk_grauinstrucao') || extractLabel('Grau de Instrução'),
    religiao: extractSelect('fk_religiao') || extractLabel('Religião'),
    estadoCivil: extractSelect('fk_estadocivil') || extractLabel('Estado Civil'),
    nomeConjuge: extractValue('nomeesposa'),
    qtdFilhos: parseInt(extractValue('qtdfilhos') || '0') || null,
    nomeMae: extractValue('nomemae'),
    nomePai: extractValue('nomepai'),
    telefone: extractValue('telefone'),
    rji: extractValue('rji'),
    regime: extractValue('regime'),
    situacao: extractSelect('situacao') || extractLabel('Situação') || extractLabel('Status'),
    dataEntrada: extractValue('dataentrada'),
    dataPrisao: extractValue('dataprisao'),
    tempoPena: extractValue('tempodepena'),
    oficioEntrada: extractValue('oficioentrada'),
    presoOriundo: extractSelect('presooriundo') || extractLabel('Preso Oriundo'),
    monitorado: extractValue('monitorado') === 'SIM',
    intramuro: extractValue('intramuro') === 'SIM',
    faccaoSipeId: parseInt(extractValue('faccao_id') || '0') || null,
    unidadeFicha,
    celaFicha,
  }
}

/**
 * Helper to update job progress in DB
 */
async function updateProgress(
  jobId: string,
  updates: Record<string, any>
): Promise<void> {
  try {
    await prisma.sipeSyncJob.update({
      where: { id: jobId },
      data: {
        ...updates,
        ultimaAtividade: new Date(),
      }
    })
  } catch (err) {
    console.error(`Erro ao atualizar progresso do job ${jobId}:`, err)
  }
}
