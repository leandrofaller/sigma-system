import { chromium } from 'playwright'
import fs from 'fs'
import path from 'path'
import { prisma } from '../src/lib/db'
import { scrapeHistorico } from '../src/lib/sipe-scraper'

// Parse manual de .env
if (fs.existsSync('.env')) {
  const envContent = fs.readFileSync('.env', 'utf-8')
  for (const line of envContent.split('\n')) {
    const parts = line.split('=')
    if (parts.length >= 2) {
      const key = parts[0].trim()
      const val = parts.slice(1).join('=').trim().replace(/^['"]|['"]$/g, '')
      process.env[key] = val
    }
  }
}

const SIPE_URL = 'https://sipe.sejus.ro.gov.br'
const SIPE_CPF = process.env.SIPE_CPF ?? ''
const SIPE_SENHA = process.env.SIPE_SENHA ?? ''
const SIPE_PERFIL = process.env.SIPE_PERFIL ?? '2'
const SIPE_UNIDADE = '18' // Unidade de Nova Mamoré

async function login(page: any, unidadeId: string) {
  await page.goto(`${SIPE_URL}/`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await page.waitForSelector('input[type="password"]', { timeout: 30_000 })

  const cpfInput =
    (await page.$('input[placeholder*="CPF"]')) ??
    (await page.$('input[name*="cpf"], input[name*="login"], input[type="text"]'))
  if (!cpfInput) {
    throw new Error(`Campo CPF não encontrado na página de login. URL atual: ${page.url()}`)
  }

  await cpfInput.fill(SIPE_CPF)
  await page.fill('input[type="password"]', SIPE_SENHA)

  const submitBtn =
    (await page.$('button[type="submit"]')) ??
    (await page.$('input[type="submit"]')) ??
    (await page.$('button'))
  if (!submitBtn) throw new Error('Botão de submit não encontrado na página de login')
  await submitBtn.click()

  try {
    await page.waitForURL('**/selectRole**', { timeout: 30_000 })
  } catch {
    const url = page.url()
    const bodyText = await page.innerText('body').catch(() => '')
    const errorMsg = bodyText.slice(0, 300).replace(/\s+/g, ' ').trim()
    throw new Error(
      `Login não redirecionou para /selectRole. URL atual: ${url}` +
      (errorMsg ? ` | Página: ${errorMsg}` : '')
    )
  }

  await page.locator('select').nth(0).waitFor({ state: 'attached', timeout: 10_000 })
  await page.locator('select').nth(1).waitFor({ state: 'attached', timeout: 10_000 })

  await page.evaluate((perfil: any) => {
    const selects = document.querySelectorAll('select')
    const selectPerfil = selects[0] as HTMLSelectElement
    if (selectPerfil) {
      selectPerfil.value = perfil
      selectPerfil.dispatchEvent(new Event('change', { bubbles: true }))
    }
  }, SIPE_PERFIL)

  try {
    await page.waitForFunction((unidade: any) => {
      const selects = document.querySelectorAll('select')
      const selectUnidade = selects[1] as HTMLSelectElement
      if (!selectUnidade) return false
      const options = Array.from(selectUnidade.options)
      return options.some(opt => opt.value === unidade)
    }, unidadeId, { timeout: 15_000 })
  } catch (err) {}

  await page.evaluate((unidade: any) => {
    const selects = document.querySelectorAll('select')
    const selectUnidade = selects[1] as HTMLSelectElement
    if (selectUnidade) {
      selectUnidade.value = unidade
      selectUnidade.dispatchEvent(new Event('change', { bubbles: true }))
    }
  }, unidadeId)

  await page.waitForTimeout(500)

  const submitBtn2 =
    (await page.$('button[type="submit"]')) ??
    (await page.$('input[type="submit"]')) ??
    (await page.$('button'))
  if (!submitBtn2) throw new Error('Botão de submit não encontrado na página selectRole')
  await submitBtn2.click()

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

async function testScrapeSingleHistorico() {
  console.log('🚀 Iniciando teste do scraper de histórico da Ficha Geral...')
  
  const sipeId = 7441
  
  // Localiza ou cria o apenado no banco local para fins de relacionamento referencial
  let apenado = await prisma.sipeApenadoImportado.findUnique({
    where: { sipeId }
  })
  
  if (!apenado) {
    console.log(`Apenado ${sipeId} não encontrado no banco local. Criando registro temporário...`)
    apenado = await prisma.sipeApenadoImportado.create({
      data: {
        sipeId,
        nome: 'LEANDRO APENADO TESTE',
        unidade: 'PENITENCIÁRIA REGIONAL DE NOVA MAMORÉ',
        cela: 'Cela de Teste'
      }
    })
  }
  
  console.log(`Apenado referenciado: ID Local = "${apenado.id}", Nome = "${apenado.nome}"`)

  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  })
  const page = await context.newPage()

  try {
    const logado = await login(page, SIPE_UNIDADE)
    if (!logado) {
      throw new Error('Falha de login no SIPE')
    }
    console.log('Login efetuado no SIPE com sucesso!')

    // Chama o scraper de histórico
    console.log(`\n⏳ Executando scrapeHistorico para sipeId ${sipeId}...`)
    await scrapeHistorico(page, sipeId, apenado.id)
    console.log('✅ Execução do scrapeHistorico finalizada!')

    // Consulta os registros inseridos/atualizados na tabela SipeHistorico
    const historicos = await prisma.sipeHistorico.findMany({
      where: { apenadoId: apenado.id },
      orderBy: { datahora: 'desc' }
    })

    console.log(`\n📊 Total de registros encontrados no banco para o apenado: ${historicos.length}`)
    historicos.forEach((h, idx) => {
      console.log(`\n[Registro #${idx + 1}]`)
      console.log(`  ID: ${h.id}`)
      console.log(`  Tipo: ${h.tipo}`)
      console.log(`  DataHora: ${h.datahora ? h.datahora.toISOString() : 'null'}`)
      console.log(`  Unidade: ${h.unidade}`)
      console.log(`  Cela: ${h.cela}`)
      console.log(`  Descrição: "${h.descricao}"`)
    })

  } catch (err: any) {
    console.error('❌ Erro durante o teste:', err)
  } finally {
    await browser.close()
    console.log('\n🏁 Teste finalizado.')
  }
}

testScrapeSingleHistorico()
