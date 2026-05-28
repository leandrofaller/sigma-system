import { chromium, Browser, BrowserContext, Page } from 'playwright'
import { prisma } from './db'

const SIPE_URL = 'https://sipe.sejus.ro.gov.br'
const SIPE_CPF = process.env.SIPE_CPF || ''
const SIPE_SENHA = process.env.SIPE_SENHA || ''
const SIPE_PERFIL = process.env.SIPE_PERFIL || '2' // Master
const SIPE_UNIDADE = process.env.SIPE_UNIDADE || '3' // CDPPVH

let browserInstance: Browser | null = null

async function getBrowser(): Promise<Browser> {
  if (!browserInstance || !browserInstance.isConnected()) {
    browserInstance = await chromium.launch({ headless: true })
  }
  return browserInstance
}

async function createSession(): Promise<BrowserContext> {
  const browser = await getBrowser()
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
  })
  return context
}

async function login(page: Page): Promise<boolean> {
  await page.goto(`${SIPE_URL}/`, { waitUntil: 'networkidle' })

  const cpfInput = await page.$('input[name="cpf"], input[placeholder*="CPF"]')
  if (!cpfInput) return false

  await cpfInput.fill(SIPE_CPF)
  await page.fill('input[type="password"]', SIPE_SENHA)
  await page.click('button[type="submit"]')
  await page.waitForURL('**/selectRole**', { timeout: 10000 })

  // Seleciona perfil e unidade
  await page.selectOption('select[name="perfil"], select:first-of-type', SIPE_PERFIL)
  await page.selectOption('select:last-of-type', SIPE_UNIDADE)
  await page.click('button[type="submit"]')
  await page.waitForURL('**/home**', { timeout: 10000 })

  return true
}

async function updateJobProgress(jobId: string, update: {
  processado?: number
  erros?: number
  log?: string
  status?: string
  total?: number
  finalizadoEm?: Date
  iniciadoEm?: Date
}) {
  const current = await prisma.sipeSyncJob.findUnique({ where: { id: jobId } })
  if (!current) return

  await prisma.sipeSyncJob.update({
    where: { id: jobId },
    data: {
      ...update,
      log: update.log
        ? (current.log ? current.log + '\n' + update.log : update.log)
        : undefined,
    },
  })
}

// ── Scraping de apenados por unidade ──────────────────────────

export async function scrapeApenadosPorUnidade(
  jobId: string,
  unidadeId: string,
  unidadeNome: string
) {
  const context = await createSession()
  const page = await context.newPage()

  try {
    await updateJobProgress(jobId, {
      status: 'RUNNING',
      iniciadoEm: new Date(),
      log: `Iniciando scraping da unidade ${unidadeNome}`,
    })

    const ok = await login(page)
    if (!ok) throw new Error('Falha no login do SIPE')

    await updateJobProgress(jobId, { log: 'Login realizado com sucesso' })

    // Coleta IDs da listagem da carceragem
    const apenadoIds = await coletarIdsApenados(page, unidadeId, jobId)

    await updateJobProgress(jobId, {
      total: apenadoIds.length,
      log: `Encontrados ${apenadoIds.length} apenados`,
    })

    let processado = 0
    let erros = 0

    for (const sipeId of apenadoIds) {
      try {
        await scrapeApenadoFicha(page, sipeId, jobId)
        processado++
        await updateJobProgress(jobId, { processado })
        await page.waitForTimeout(300 + Math.random() * 500)
      } catch (err) {
        erros++
        await updateJobProgress(jobId, {
          erros,
          log: `Erro ao processar apenado ${sipeId}: ${err}`,
        })
      }
    }

    // Scrape de advogados da unidade
    await updateJobProgress(jobId, { log: 'Iniciando scraping de advogados...' })
    await scrapeAdvogados(page, jobId)

    await updateJobProgress(jobId, {
      status: 'COMPLETED',
      finalizadoEm: new Date(),
      log: `Concluído: ${processado} processados, ${erros} erros`,
    })
  } catch (err) {
    await updateJobProgress(jobId, {
      status: 'FAILED',
      finalizadoEm: new Date(),
      log: `Erro fatal: ${err}`,
    })
    throw err
  } finally {
    await context.close()
  }
}

async function coletarIdsApenados(page: Page, unidadeId: string, jobId: string): Promise<number[]> {
  const ids: number[] = []

  // Pega todas as carceragens disponíveis
  await page.goto(`${SIPE_URL}/listagem/${unidadeId}/carceragem`, { waitUntil: 'networkidle' })

  // Seleciona "All" para mostrar todos
  await page.selectOption('select[name*="DataTables_Table"]', '-1').catch(() => {})
  await page.waitForTimeout(1000)

  const rows = await page.$$('table tbody tr')
  for (const row of rows) {
    const firstCell = await row.$('th, td:first-child')
    if (!firstCell) continue
    const text = await firstCell.innerText()
    const id = parseInt(text.trim())
    if (!isNaN(id)) ids.push(id)
  }

  await updateJobProgress(jobId, { log: `IDs coletados da listagem principal: ${ids.length}` })

  // Também percorre carceragens/pavilhões específicos
  const carcLinks = await page.$$('a[href*="/fichaCela"]')
  const carcUrls = await Promise.all(carcLinks.map(l => l.getAttribute('href')))

  for (const url of carcUrls) {
    if (!url) continue
    try {
      await page.goto(`${SIPE_URL}${url}`, { waitUntil: 'networkidle' })
      await page.selectOption('select[name*="DataTables_Table"]', '-1').catch(() => {})
      await page.waitForTimeout(500)

      const cellRows = await page.$$('table tbody tr')
      for (const row of cellRows) {
        const cell = await row.$('th, td:first-child')
        if (!cell) continue
        const text = await cell.innerText()
        const id = parseInt(text.trim())
        if (!isNaN(id) && !ids.includes(id)) ids.push(id)
      }
    } catch {
      // ignora erros de carceragens individuais
    }
  }

  return [...new Set(ids)]
}

async function scrapeApenadoFicha(page: Page, sipeId: number, _jobId: string) {
  await page.goto(`${SIPE_URL}/apenados/${sipeId}/editar`, { waitUntil: 'networkidle' })

  const dados = await page.evaluate(() => {
    const val = (name: string) =>
      (document.querySelector(`[name="${name}"]`) as HTMLInputElement | null)?.value?.trim() || null
    const selVal = (name: string) => {
      const el = document.querySelector(`[name="${name}"]`) as HTMLSelectElement | null
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
      faccaoSipeId: parseInt((document.querySelector('[name="faccao_id"]') as HTMLInputElement)?.value || '0') || null,
    }
  })

  // Cela e unidade vêm do breadcrumb/header
  const unidadeEl = await page.$('.navbar-brand, nav a[href="#"]')
  const unidade = unidadeEl ? await unidadeEl.innerText() : null

  // Busca facção local se houver
  let faccaoId: string | null = null
  if (dados.faccaoSipeId && dados.faccaoSipeId > 0) {
    const faccao = await prisma.sipeFaccao.findUnique({ where: { sipeId: dados.faccaoSipeId } })
    faccaoId = faccao?.id || null
  }

  // Upsert apenado importado
  const apenado = await prisma.sipeApenadoImportado.upsert({
    where: { sipeId },
    create: {
      sipeId,
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
      unidade,
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
    },
    update: {
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
      unidade,
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
    },
  })

  // Scrape processos
  await scrapeProcessos(page, sipeId, apenado.id)

  // Scrape alcunhas
  await scrapeAlcunhas(page, sipeId, apenado.id)
}

async function scrapeProcessos(page: Page, sipeId: number, apenadoId: string) {
  try {
    await page.goto(`${SIPE_URL}/apenados/${sipeId}/incluirProcessos`, { waitUntil: 'networkidle' })
    const text = await page.innerText('body')

    // Extrai processos do texto da página
    const processoRegex = /(\d+) - NÚMERO PROCESSO: ([^\n/]*)/g
    let match
    while ((match = processoRegex.exec(text)) !== null) {
      const sipeProcessoId = parseInt(match[1])
      const numero = match[2].trim()

      const artigos: string[] = []
      const artigoRegex = /Art\s*\d+[^\n]*/g
      let artMatch
      while ((artMatch = artigoRegex.exec(text)) !== null) {
        artigos.push(artMatch[0].trim())
      }

      await prisma.sipeProcesso.upsert({
        where: {
          id: `${apenadoId}_${sipeProcessoId}`,
        },
        create: {
          id: `${apenadoId}_${sipeProcessoId}`,
          apenadoId,
          sipeProcessoId,
          numero,
          artigos,
        },
        update: { numero, artigos },
      })
    }
  } catch {
    // ignora erros de processos
  }
}

async function scrapeAlcunhas(page: Page, sipeId: number, apenadoId: string) {
  try {
    await page.goto(`${SIPE_URL}/apenados/${sipeId}/alcunhas`, { waitUntil: 'networkidle' })

    const rows = await page.$$('table tbody tr')
    for (const row of rows) {
      const cells = await row.$$('td')
      if (cells.length < 2) continue
      const alcunha = await cells[1].innerText()
      if (!alcunha.trim()) continue

      const exists = await prisma.sipeAlcunha.findFirst({
        where: { apenadoId, alcunha: alcunha.trim() },
      })
      if (!exists) {
        await prisma.sipeAlcunha.create({
          data: { apenadoId, alcunha: alcunha.trim() },
        })
      }
    }
  } catch {
    // ignora erros de alcunhas
  }
}

async function scrapeAdvogados(page: Page, jobId: string) {
  await page.goto(`${SIPE_URL}/advogados/listaradvogados`, { waitUntil: 'networkidle' })
  await page.selectOption('select[name*="DataTables_Table"]', '-1').catch(() => {})
  await page.waitForTimeout(1000)

  const links = await page.$$eval(
    'tbody a[href*="/detalhaclientes"]',
    els => els.map(el => {
      const anchor = el as HTMLAnchorElement
      return { href: anchor.getAttribute('href'), id: anchor.href.match(/\/advogados\/(\d+)\//)?.[1] }
    })
  )

  await updateJobProgress(jobId, { log: `Advogados encontrados: ${links.length}` })

  for (const link of links) {
    if (!link.href || !link.id) continue
    try {
      await scrapeAdvogadoDetalhe(page, parseInt(link.id), jobId)
      await page.waitForTimeout(200 + Math.random() * 300)
    } catch (err) {
      await updateJobProgress(jobId, { log: `Erro advogado ${link.id}: ${err}` })
    }
  }
}

async function scrapeAdvogadoDetalhe(page: Page, sipeId: number, _jobId: string) {
  await page.goto(`${SIPE_URL}/advogados/${sipeId}/detalhaclientes`, { waitUntil: 'networkidle' })
  const text = await page.innerText('body')

  // Extrai dados do advogado
  const nome = text.match(/Nome do Advogado\s+([^\n]+)/)?.[1]?.trim()
  const oab = text.match(/OAB\s+([^\n]+)/)?.[1]?.trim()
  const cpf = text.match(/CPF\s+([0-9./-]+)/)?.[1]?.trim()
  const telefone = text.match(/Telefone de Contato\s+([^\n]+)/)?.[1]?.trim()
  const dataCadastro = text.match(/Data de Cadastro\s+([^\n]+)/)?.[1]?.trim()

  if (!nome) return

  const advogado = await prisma.sipeAdvogado.upsert({
    where: { sipeId },
    create: { sipeId, nome, oab, cpf, telefone, dataCadastro },
    update: { nome, oab, cpf, telefone, dataCadastro },
  })

  // Extrai apenados atendidos - "Nome Apenado\nXXX\nCpf\nYYY"
  const blocos = text.split('Informações do Apenado').slice(1)
  for (const bloco of blocos) {
    const nomeApenado = bloco.match(/Nome Apenado\s+([^\n]+)/)?.[1]?.trim()
    const cpfApenado = bloco.match(/Cpf\s+([^\n]+)/)?.[1]?.trim()

    if (!nomeApenado) continue

    // Tenta encontrar o apenado importado pelo CPF ou nome
    let importado = cpfApenado
      ? await prisma.sipeApenadoImportado.findFirst({ where: { cpf: cpfApenado } })
      : null
    if (!importado) {
      importado = await prisma.sipeApenadoImportado.findFirst({ where: { nome: nomeApenado } })
    }

    if (importado) {
      await prisma.sipeVinculoAdvogado.upsert({
        where: { apenadoId_advogadoId: { apenadoId: importado.id, advogadoId: advogado.id } },
        create: { apenadoId: importado.id, advogadoId: advogado.id },
        update: { ativo: true },
      })
    }
  }
}

export async function scrapeFaccoes() {
  const context = await createSession()
  const page = await context.newPage()

  try {
    await login(page)

    // Tenta extrair facções do formulário de edição de qualquer apenado
    await page.goto(`${SIPE_URL}/apenados/index`, { waitUntil: 'networkidle' })

    // Pega o primeiro apenado disponível
    const firstLink = await page.$('tbody a[href*="/selecionarOpcao"]')
    if (!firstLink) return

    const href = await firstLink.getAttribute('href')
    if (!href) return
    const match = href.match(/\/apenados\/(\d+)\//)
    if (!match) return
    const sipeId = parseInt(match[1])

    await page.goto(`${SIPE_URL}/apenados/${sipeId}/faccao`, { waitUntil: 'networkidle' })

    const options = await page.$$eval('select option', opts =>
      (opts as HTMLOptionElement[])
        .filter(o => o.value && o.value !== '0' && o.value !== '')
        .map(o => ({ value: o.value, text: o.textContent?.trim() || '' }))
    )

    for (const opt of options) {
      const sipeId = parseInt(opt.value)
      if (isNaN(sipeId)) continue
      await prisma.sipeFaccao.upsert({
        where: { sipeId },
        create: { sipeId, nome: opt.text },
        update: { nome: opt.text },
      })
    }
  } finally {
    await context.close()
  }
}

export async function closeBrowser() {
  if (browserInstance) {
    await browserInstance.close()
    browserInstance = null
  }
}
