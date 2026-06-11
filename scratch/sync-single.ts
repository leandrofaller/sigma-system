import { chromium } from 'playwright'
import dotenv from 'dotenv'
import { prisma } from '../src/lib/db'
dotenv.config()

const SIPE_URL = 'https://sipe.sejus.ro.gov.br'
const SIPE_CPF = process.env.SIPE_CPF ?? ''
const SIPE_SENHA = process.env.SIPE_SENHA ?? ''
const SIPE_PERFIL = process.env.SIPE_PERFIL ?? '2'
const SIPE_UNIDADE = process.env.SIPE_UNIDADE ?? '3'

// Replicar a função de login
async function login(page: any, unidadeId: string) {
  await page.goto(`${SIPE_URL}/`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForSelector('input[type="password"]', { timeout: 30000 })
  const cpfInput = await page.$('input[placeholder*="CPF"], input[name*="cpf"], input[type="text"]')
  if (!cpfInput) throw new Error('CPF input not found')
  await cpfInput.fill(SIPE_CPF)
  await page.fill('input[type="password"]', SIPE_SENHA)
  const submitBtn = await page.$('button[type="submit"], input[type="submit"]')
  await submitBtn.click()
  
  await page.waitForURL('**/selectRole**', { timeout: 30000 })
  await page.locator('select').nth(0).waitFor({ state: 'attached', timeout: 10000 })
  await page.locator('select').nth(1).waitFor({ state: 'attached', timeout: 10000 })
  
  await page.evaluate(`(perfil) => {
    const selects = document.querySelectorAll('select')
    if (selects[0]) {
      selects[0].value = perfil
      selects[0].dispatchEvent(new Event('change', { bubbles: true }))
    }
  }`, SIPE_PERFIL)
  
  await page.waitForFunction((unidade) => {
    const selects = document.querySelectorAll('select')
    return selects[1] && Array.from(selects[1].options).some(opt => opt.value === unidade)
  }, unidadeId, { timeout: 15000 })
  
  await page.evaluate(`(unidade) => {
    const selects = document.querySelectorAll('select')
    if (selects[1]) {
      selects[1].value = unidade
      selects[1].dispatchEvent(new Event('change', { bubbles: true }))
    }
  }`, unidadeId)
  
  await page.waitForTimeout(500)
  const submitBtn2 = await page.$('button[type="submit"], input[type="submit"]')
  await submitBtn2.click()
  await page.waitForURL('**/home**', { timeout: 30000 })
  return true
}

async function scrapeApenadoFichaPlaywright(page: any, sipeId: number, unidadeNome: string | null) {
  const searchPath = `/apenados/index?escolha=nomeapenado&parametro=${sipeId}`
  await page.goto(`${SIPE_URL}${searchPath}`, { waitUntil: 'domcontentloaded', timeout: 45000 })
  
  const link = await page.evaluate(`(id) => {
    const rows = Array.from(document.querySelectorAll('table tbody tr'))
    for (const row of rows) {
      const text = row.textContent ?? ''
      if (text.includes(String(id))) {
        const a = row.querySelector('a[href]') as HTMLAnchorElement | null
        if (a?.href) return a.href
      }
    }
    const anchors = Array.from(document.querySelectorAll('a[href]')) as HTMLAnchorElement[]
    for (const a of anchors) {
      if (a.href.includes('/apenados/' + id)) return a.href
    }
    return null
  }`, sipeId)
  
  if (!link) {
    throw new Error('APENADO_NAO_ENCONTRADO')
  }
  
  console.log(`Navegando para o link: ${link}`)
  await page.goto(link, { waitUntil: 'domcontentloaded', timeout: 45000 })
  await page.waitForSelector('[name="nomeapenado"]', { timeout: 30000 })
  
  const dados = await page.evaluate(`() => {
    const val = (name) =>
      document.querySelector('[name="' + name + '"]')?.value?.trim() || null

    const selVal = (name) => {
      const el = document.querySelector('[name="' + name + '"]')
      return el?.options[el.selectedIndex]?.text?.trim() || null
    }

    const bodyText = document.body?.innerText || ''

    let celaFicha = null
    const celaMatch = bodyText.match(/Cela:\\s*([^\\n]+)/i) || bodyText.match(/Cela\\s*-\\s*([^\\n]+)/i)
    if (celaMatch) celaFicha = celaMatch[1].trim()

    let unidadeFicha = null
    const unidadeMatch = bodyText.match(/Unidade:\\s*([^\\n]+)/i) || bodyText.match(/Estabelecimento:\\s*([^\\n]+)/i) || bodyText.match(/Unidade\\s*Prisional:\\s*([^\\n]+)/i)
    if (unidadeMatch) unidadeFicha = unidadeMatch[1].trim()

    const extractLabel = (label) => {
      let match = bodyText.match(new RegExp(label + '\\\\s*:?\\\\s*([^\\\\n]+)', 'i'))
      if (match) {
        const value = match[1].trim()
        if (value && value.length > 0 && !value.match(/^[\\s•\\-–—]+$/)) return value
      }
      match = bodyText.match(new RegExp(label + '\\\\s*[\\\\n\\\\r]+\\\\s*([^\\\\n]+)', 'i'))
      if (match) {
        const value = match[1].trim()
        if (value && value.length > 0 && !value.match(/^[\\s•\\-–—]+$/)) return value
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
      orientacaoSexual: selVal('homosexual') || extractLabel('Orientação\\\\s+Sexual'),
      tipoSanguineo: selVal('tiposanguineo') || extractLabel('Tipo\\\\s+(?:de\\\\s+)?Sanguíneo'),
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
      faccaoSipeId: parseInt(document.querySelector('[name="faccao_id"]')?.value || '0') || null,
      celaFicha,
      unidadeFicha,
    }
  }`)

  console.log('Dados extraídos da página pelo Playwright:', dados)
  
  const resolvedUnidade = unidadeNome ?? (dados as any).unidadeFicha ?? null
  const resolvedCela = (dados as any).celaFicha ?? null
  const resolvedSituacao = (dados as any).situacao ?? null

  const upsertData = {
    nome: (dados as any).nome || 'SEM NOME',
    nomeOutro: (dados as any).nomeOutro,
    cpf: (dados as any).cpf,
    rg: (dados as any).rg,
    rgOrgao: (dados as any).rgOrgao,
    dataNascimento: (dados as any).dataNascimento,
    naturalidade: (dados as any).naturalidade,
    sexo: (dados as any).sexo,
    etnia: (dados as any).etnia,
    orientacaoSexual: (dados as any).orientacaoSexual,
    tipoSanguineo: (dados as any).tipoSanguineo,
    grauInstrucao: (dados as any).grauInstrucao,
    religiao: (dados as any).religiao,
    estadoCivil: (dados as any).estadoCivil,
    nomeConjuge: (dados as any).nomeConjuge,
    qtdFilhos: (dados as any).qtdFilhos,
    nomeMae: (dados as any).nomeMae,
    nomePai: (dados as any).nomePai,
    telefone: (dados as any).telefone,
    rji: (dados as any).rji,
    regime: (dados as any).regime,
    situacao: resolvedSituacao || undefined,
    dataEntrada: (dados as any).dataEntrada,
    dataPrisao: (dados as any).dataPrisao,
    tempoPena: (dados as any).tempoPena,
    monitorado: (dados as any).monitorado,
    intramuro: (dados as any).intramuro,
    presoOriundo: (dados as any).presoOriundo,
    oficioEntrada: (dados as any).oficioEntrada,
    unidade: resolvedUnidade,
    cela: resolvedCela || undefined,
    ultimaSyncAt: new Date(),
  }

  const updated = await prisma.sipeApenadoImportado.update({
    where: { sipeId },
    data: upsertData
  })

  console.log('Registro atualizado no banco local com sucesso:', {
    sipeId: updated.sipeId,
    nome: updated.nome,
    situacao: updated.situacao,
    unidade: updated.unidade,
    nomeMae: updated.nomeMae
  })
}

async function main() {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()
  try {
    console.log('Fazendo login no SIPE...')
    await login(page, SIPE_UNIDADE)
    
    const sipeId = 41920
    console.log(`Iniciando scrape do apenado SIPE ID #${sipeId}...`)
    await scrapeApenadoFichaPlaywright(page, sipeId, null)
  } catch (err) {
    console.error('Erro:', err)
  } finally {
    await browser.close()
    await prisma.$disconnect()
  }
}

main()
