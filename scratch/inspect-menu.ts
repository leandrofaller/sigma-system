import { chromium } from 'playwright'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

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

async function inspectMenu() {
  console.log('Iniciando inspeção do menu superior do SIPE...')

  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  })
  const page = await context.newPage()

  try {
    console.log('Realizando login...')
    await page.goto(`${SIPE_URL}/`, { waitUntil: 'domcontentloaded', timeout: 60000 })
    await page.waitForSelector('input[type="password"]', { timeout: 30000 })
    
    const cpfInput = (await page.$('input[placeholder*="CPF"]')) ?? (await page.$('input[name*="cpf"], input[name*="login"], input[type="text"]'))
    if (!cpfInput) throw new Error('CPF input not found')
    await cpfInput.fill(SIPE_CPF)
    await page.fill('input[type="password"]', SIPE_SENHA)
    
    const submitBtn = (await page.$('button[type="submit"]')) ?? (await page.$('input[type="submit"]'))
    await submitBtn.click()

    await page.waitForURL('**/selectRole**', { timeout: 30000 })
    await page.locator('select').nth(0).waitFor({ state: 'attached', timeout: 10000 })
    
    await page.evaluate((perfil) => {
      const select = document.querySelectorAll('select')[0] as HTMLSelectElement
      if (select) {
        select.value = perfil
        select.dispatchEvent(new Event('change', { bubbles: true }))
      }
    }, SIPE_PERFIL)

    await page.waitForTimeout(1000)

    await page.evaluate((unidade) => {
      const select = document.querySelectorAll('select')[1] as HTMLSelectElement
      if (select) {
        select.value = unidade
        select.dispatchEvent(new Event('change', { bubbles: true }))
      }
    }, SIPE_UNIDADE)

    const submitBtn2 = (await page.$('button[type="submit"]')) ?? (await page.$('input[type="submit"]'))
    await submitBtn2.click()

    await page.waitForURL('**/home**', { timeout: 30000 })
    console.log('Login efetuado com sucesso!')

    // Mapear todos os links no cabeçalho/barra superior
    const linksHeader = await page.evaluate(() => {
      // Procura em elementos de menu superior (geralmente nav, navbar, header, ul no topo, etc.)
      const links = Array.from(document.querySelectorAll('a, button, li'))
      return links
        .map((el) => {
          const tag = el.tagName.toLowerCase()
          const html = el.outerHTML
          const text = el.textContent?.trim() ?? ''
          const href = el.getAttribute('href') ?? ''
          const className = el.className ?? ''
          const id = el.id ?? ''
          
          return { tag, text, href, className, id, html: html.slice(0, 400) }
        })
        .filter(l => {
          // Filtra apenas elementos que parecem estar no menu superior ou que contêm ícones
          return l.href.includes('selectRole') || 
                 l.href.includes('perfil') || 
                 l.href.includes('unidade') || 
                 l.href.includes('role') ||
                 l.html.includes('fa-') || 
                 l.html.includes('glyphicon-') || 
                 l.html.includes('icon-') ||
                 l.html.includes('img') ||
                 l.html.includes('image') ||
                 l.className.includes('dropdown') ||
                 l.html.includes('database') ||
                 l.html.includes('server') ||
                 l.className.includes('user') ||
                 l.text.includes('Leandro')
        })
    })

    console.log('--- Links e ícones relevantes no topo da página ---')
    console.log(JSON.stringify(linksHeader, null, 2))

  } catch (err) {
    console.error('Erro durante a inspeção do menu:', err)
  } finally {
    await browser.close()
  }
}

inspectMenu()
