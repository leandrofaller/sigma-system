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
import * as cheerio from 'cheerio'
import { parseAndSaveFichaGeralCheerio } from './sipe-scraper'

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

    // --- Extração de Advogados e Visitantes via Firecrawl ---
    try {
      // Prioridade: Obter Ficha Geral Consolidada via POST (necessário para advogados/visitantes no SIPE real)
      let fichaGeralHtml = ''
      let csrfToken = ''
      
      try {
        const $edit = cheerio.load(response.html || '')
        csrfToken = $edit('input[name="_token"]').val()?.toString() || ''
      } catch (tokenErr: any) {
        console.warn(`[FIRECRAWL] Não foi possível extrair CSRF token do apenado #${sipeId}:`, tokenErr.message || tokenErr)
      }

      if (csrfToken) {
        const bodyParams = new URLSearchParams()
        bodyParams.append('_token', csrfToken)
        bodyParams.append('apenado_id', String(sipeId))
        bodyParams.append('listar[]', 'DP')
        bodyParams.append('listar[]', 'M')
        bodyParams.append('listar[]', 'A')
        bodyParams.append('listar[]', 'V')

        // 1. Tentar via Python Proxy FastAPI
        try {
          const SIPE_PYTHON_API_URL = process.env.SIPE_PYTHON_API_URL || 'http://localhost:8000'
          const proxyRes = await fetch(`${SIPE_PYTHON_API_URL}/sipe/proxy`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Sipe-Unidade': unidade || SIPE_UNIDADE,
            },
            body: JSON.stringify({
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
            }),
            signal: AbortSignal.timeout(10000)
          })

          if (proxyRes.ok) {
            const data = await proxyRes.json() as any
            if (data && data.html && !data.html.includes('PÁGINA PRINCIPAL') && !data.html.includes('Oops!!')) {
              fichaGeralHtml = data.html
              console.log(`[FIRECRAWL] ✅ Ficha Geral obtida com sucesso via Python Proxy para #${sipeId}`)
            }
          }
        } catch (proxyErr: any) {
          console.warn(`[FIRECRAWL] Tentativa de Ficha Geral via Python Proxy falhou: ${proxyErr.message || proxyErr}. Tentando fetch direto...`)
        }

        // 2. Se falhar, tentar Fetch Direto usando cookies do .env
        if (!fichaGeralHtml) {
          try {
            const directRes = await fetch(`${SIPE_URL}/relatorios/fichaGeral`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Cookie': process.env.SIPE_COOKIES || '',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
              },
              body: bodyParams.toString(),
              signal: AbortSignal.timeout(10000)
            })

            if (directRes.ok) {
              const text = await directRes.text()
              if (text && !text.includes('PÁGINA PRINCIPAL') && !text.includes('Oops!!')) {
                fichaGeralHtml = text
                console.log(`[FIRECRAWL] ✅ Ficha Geral obtida com sucesso via Fetch Direto para #${sipeId}`)
              }
            }
          } catch (directErr: any) {
            console.error(`[FIRECRAWL] Fetch direto da Ficha Geral falhou para #${sipeId}:`, directErr.message || directErr)
          }
        }

        // 3. Se obtivemos o HTML da Ficha Geral, fazer parse e salvar
        if (fichaGeralHtml) {
          try {
            await parseAndSaveFichaGeralCheerio(fichaGeralHtml, apenado.id)
            console.log(`[FIRECRAWL] ✅ Ficha Geral processada com sucesso para #${sipeId}`)
          } catch (parseErr: any) {
            console.error(`[FIRECRAWL] Erro ao processar Ficha Geral para #${sipeId}:`, parseErr.message || parseErr)
          }
        }
      }

      // Fallback: Tenta obter o HTML de advogados pelas rotas secundárias/legadas
      const rotasAdvogados = [
        `${SIPE_URL}/apenados/${sipeId}/advogados`,
        `${SIPE_URL}/apenados/${sipeId}/credenciamento`,
        `${SIPE_URL}/apenados/${sipeId}/atendimentos`,
        `${SIPE_URL}/apenados/${sipeId}/credenciados`
      ]
      
      let advHtml = ''
      for (const rota of rotasAdvogados) {
        try {
          const res = (await app.scrapeUrl(rota, {
            formats: ['html'],
            timeout: FIRECRAWL_TIMEOUT
          })) as any
          if (res.success && res.html && res.html.length > 500 && !res.html.includes('404') && !res.html.includes('não encontrado')) {
            advHtml = res.html
            break
          }
        } catch { /* ignore */ }
      }
      
      if (advHtml) {
        await parseAndSaveAdvogadosFirecrawl(advHtml, apenado.id)
      }
      
      // Fallback: Tenta obter o HTML de visitantes pelas rotas secundárias/legadas
      try {
        const rotaVisitantes = `${SIPE_URL}/autorizacoes/${sipeId}/mostrar`
        const res = (await app.scrapeUrl(rotaVisitantes, {
          formats: ['html'],
          timeout: FIRECRAWL_TIMEOUT
        })) as any
        if (res.success && res.html && res.html.length > 500 && !res.html.includes('404') && !res.html.includes('não encontrado')) {
          await parseAndSaveVisitantesFirecrawl(res.html, apenado.id)
        }
      } catch (visitErr) {
        console.error(`[FIRECRAWL] Erro ao buscar visitantes via rota secundária para #${sipeId}:`, visitErr)
      }
    } catch (subErr: any) {
      console.error(`[FIRECRAWL] Erro geral ao buscar subdados para #${sipeId}:`, subErr.message || subErr)
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

async function parseAndSaveAdvogadosFirecrawl(html: string, apenadoId: string): Promise<boolean> {
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
    const match = item.href.match(/\/advogados?\/(\d+)/) || item.href.match(/\/detalhaclientes\/(\d+)/) || item.href.match(/[?&]id=(\d+)/)
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

async function parseAndSaveVisitantesFirecrawl(html: string, apenadoId: string): Promise<void> {
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
        nome: nome.toUpperCase(),
        cpf: cpf && cpf.length === 11 ? cpf : null,
        parentesco: parentesco ? parentesco.toUpperCase() : null,
        photoSrc,
        ativo: isTableAtivo
      })
    })
  })

  for (const item of list) {
    let visitante = null
    
    if (item.cpf) {
      visitante = await prisma.sipeVisitante.findFirst({
        where: { cpf: item.cpf }
      })
    }
    if (!visitante && item.nome) {
      visitante = await prisma.sipeVisitante.findFirst({
        where: { nome: item.nome }
      })
    }

    if (!visitante) {
      visitante = await prisma.sipeVisitante.create({
        data: {
          nome: item.nome,
          cpf: item.cpf,
          parentesco: item.parentesco,
          photoPath: item.photoSrc
        }
      })
    } else {
      const updateData: any = {}
      if (item.cpf && !visitante.cpf) updateData.cpf = item.cpf
      if (item.parentesco && !visitante.parentesco) updateData.parentesco = item.parentesco
      if (item.photoSrc && !visitante.photoPath) updateData.photoPath = item.photoSrc
      
      if (Object.keys(updateData).length > 0) {
        visitante = await prisma.sipeVisitante.update({
          where: { id: visitante.id },
          data: updateData
        })
      }
    }

    await prisma.sipeVinculoVisitante.upsert({
      where: {
        apenadoId_visitanteId: {
          apenadoId,
          visitanteId: visitante.id
        }
      },
      create: {
        apenadoId,
        visitanteId: visitante.id,
        ativo: item.ativo
      },
      update: {
        ativo: item.ativo
      }
    })
  }
}

