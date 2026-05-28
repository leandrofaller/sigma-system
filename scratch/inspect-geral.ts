import { chromium } from 'playwright'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

// Função simples para carregar variáveis do .env
function loadEnv() {
  const envPath = join(__dirname, '../.env')
  if (!existsSync(envPath)) return
  const lines = readFileSync(envPath, 'utf8').split('\n')
  for (const line of lines) {
    const match = line.match(/^\s*([^#=]+)\s*=\s*(.*)\s*$/)
    if (match) {
      const key = match[1].trim()
      let value = match[2].trim()
      if (value.startsWith('"') && value.endsWith('"')) {
        value = value.slice(1, -1)
      } else if (value.startsWith("'") && value.endsWith("'")) {
        value = value.slice(1, -1)
      }
      process.env[key] = value
    }
  }
}

loadEnv()

const SIPE_URL = 'https://sipe.sejus.ro.gov.br'
const SIPE_CPF = process.env.SIPE_CPF ?? ''
const SIPE_SENHA = process.env.SIPE_SENHA ?? ''
const SIPE_PERFIL = process.env.SIPE_PERFIL ?? '2'
const SIPE_UNIDADE = process.env.SIPE_UNIDADE ?? '3'

async function inspect() {
  console.log('CPF:', SIPE_CPF)
  console.log('Unidade:', SIPE_UNIDADE)

  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  })
  const page = await context.newPage()

  try {
    console.log('Navegando para login...')
    await page.goto(`${SIPE_URL}/`, { waitUntil: 'domcontentloaded', timeout: 60000 })
    await page.waitForSelector('input[type="password"]', { timeout: 30000 })
    
    const cpfInput = (await page.$('input[placeholder*="CPF"]')) ?? (await page.$('input[name*="cpf"], input[name*="login"], input[type="text"]'))
    if (!cpfInput) throw new Error('CPF input not found')
    await cpfInput.fill(SIPE_CPF)
    await page.fill('input[type="password"]', SIPE_SENHA)
    
    const submitBtn = (await page.$('button[type="submit"]')) ?? (await page.$('input[type="submit"]')) ?? (await page.$('button'))
    if (!submitBtn) throw new Error('Submit button not found')
    await submitBtn.click()

    console.log('Esperando selectRole...')
    await page.waitForURL('**/selectRole**', { timeout: 30000 })
    await page.locator('select').nth(0).waitFor({ state: 'attached', timeout: 10000 })
    
    // Perfil
    await page.evaluate((perfil) => {
      const select = document.querySelectorAll('select')[0] as HTMLSelectElement
      if (select) {
        select.value = perfil
        select.dispatchEvent(new Event('change', { bubbles: true }))
      }
    }, SIPE_PERFIL)

    await page.waitForTimeout(1000)

    // Unidade
    await page.evaluate((unidade) => {
      const select = document.querySelectorAll('select')[1] as HTMLSelectElement
      if (select) {
        select.value = unidade
        select.dispatchEvent(new Event('change', { bubbles: true }))
      }
    }, SIPE_UNIDADE)

    const submitBtn2 = (await page.$('button[type="submit"]')) ?? (await page.$('input[type="submit"]'))
    if (!submitBtn2) throw new Error('Second submit button not found')
    await submitBtn2.click()

    console.log('Esperando home...')
    await page.waitForURL('**/home**', { timeout: 30000 })

    console.log('Navegando para /listagem/geral...')
    await page.goto(`${SIPE_URL}/listagem/geral`, { waitUntil: 'domcontentloaded', timeout: 30000 })
    await page.waitForTimeout(5000) // Aguarda carregamento AJAX/DOM

    console.log('Página carregada:', page.url())

    // 1. Verificar se há abas ou navegação por tabs
    const tabsInfo = await page.evaluate(() => {
      const tabs = Array.from(document.querySelectorAll('ul.nav-tabs li a, .nav-pills li a, [role="tab"], .tabs a'))
      return tabs.map(t => ({
        text: t.textContent?.trim() ?? '',
        href: t.getAttribute('href') ?? '',
        class: t.className ?? '',
        id: t.id ?? '',
        active: t.classList.contains('active') || t.parentElement?.classList.contains('active')
      }))
    })
    console.log('--- Abas encontradas ---')
    console.log(JSON.stringify(tabsInfo, null, 2))

    // 2. Verificar a estrutura da tabela e colunas
    const tablesInfo = await page.evaluate(() => {
      const tables = Array.from(document.querySelectorAll('table'))
      return tables.map((t, idx) => {
        const headers = Array.from(t.querySelectorAll('thead th, thead td')).map(h => h.textContent?.trim() ?? '')
        const firstRowCells = Array.from(t.querySelectorAll('tbody tr:first-child td, tbody tr:first-child th')).map(c => {
          return {
            text: c.textContent?.trim() ?? '',
            html: c.innerHTML ?? '',
            firstLink: c.querySelector('a')?.getAttribute('href') ?? null
          }
        })
        return {
          index: idx,
          id: t.id ?? '',
          className: t.className ?? '',
          headers,
          firstRowCells,
          rowsCount: t.querySelectorAll('tbody tr').length
        }
      })
    })
    console.log('--- Tabelas encontradas ---')
    console.log(JSON.stringify(tablesInfo, null, 2))

    // Tirar screenshot
    const screenshotPath = join(__dirname, 'inspect_screenshot.png')
    await page.screenshot({ path: screenshotPath, fullPage: true })
    console.log('Screenshot salvo em:', screenshotPath)

  } catch (err) {
    console.error('Erro durante a inspeção:', err)
  } finally {
    await browser.close()
  }
}

inspect()
