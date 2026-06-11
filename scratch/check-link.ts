import { chromium } from 'playwright'
import dotenv from 'dotenv'
dotenv.config()

const SIPE_URL = 'https://sipe.sejus.ro.gov.br'
const SIPE_CPF = process.env.SIPE_CPF ?? ''
const SIPE_SENHA = process.env.SIPE_SENHA ?? ''
const SIPE_PERFIL = process.env.SIPE_PERFIL ?? '2'
const SIPE_UNIDADE = process.env.SIPE_UNIDADE ?? '3'

async function main() {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()
  
  try {
    await page.goto(`${SIPE_URL}/login`, { waitUntil: 'domcontentloaded', timeout: 60000 })
    await page.waitForSelector('input[type="password"]', { timeout: 15000 })
    
    const cpfInput = await page.$('input[placeholder*="CPF"], input[name*="cpf"], input[type="text"]')
    if (cpfInput) await cpfInput.fill(SIPE_CPF)
    await page.fill('input[type="password"]', SIPE_SENHA)
    
    const submitBtn = await page.$('button[type="submit"], input[type="submit"]')
    await submitBtn?.click()
    await page.waitForURL('**/selectRole**', { timeout: 30000 })
    
    // Selecionar perfil e unidade
    await page.evaluate((perfil) => {
      const selects = document.querySelectorAll('select')
      if (selects[0]) {
        selects[0].value = perfil
        selects[0].dispatchEvent(new Event('change', { bubbles: true }))
      }
    }, SIPE_PERFIL)
    
    await page.waitForFunction((unidade) => {
      const selects = document.querySelectorAll('select')
      return selects[1] && Array.from(selects[1].options).some(opt => opt.value === unidade)
    }, SIPE_UNIDADE, { timeout: 15000 })
    
    await page.evaluate((unidade) => {
      const selects = document.querySelectorAll('select')
      if (selects[1]) {
        selects[1].value = unidade
        selects[1].dispatchEvent(new Event('change', { bubbles: true }))
      }
    }, SIPE_UNIDADE)
    
    await page.waitForTimeout(500)
    const submitBtn2 = await page.$('button[type="submit"], input[type="submit"]')
    await submitBtn2?.click()
    await page.waitForURL('**/home**', { timeout: 30000 })
    
    const sipeId = 41920
    const searchPath = `${SIPE_URL}/apenados/index?escolha=nomeapenado&parametro=${sipeId}`
    console.log(`Acessando busca: ${searchPath}`)
    await page.goto(searchPath, { waitUntil: 'domcontentloaded', timeout: 30000 })
    
    // Imprimir todos os links da linha do apenado
    const linksInfo = await page.evaluate((id) => {
      const rows = Array.from(document.querySelectorAll('table tbody tr'))
      const info: any[] = []
      
      for (const row of rows) {
        const text = row.textContent ?? ''
        if (text.includes(String(id))) {
          const anchors = Array.from(row.querySelectorAll('a[href]')) as HTMLAnchorElement[]
          anchors.forEach((a, index) => {
            info.push({
              index,
              text: a.textContent?.trim(),
              href: a.href,
              html: a.outerHTML
            })
          })
        }
      }
      return info
    }, sipeId)
    
    console.log('Links encontrados na linha do apenado:')
    console.log(JSON.stringify(linksInfo, null, 2))
    
    // O código do scraper seleciona o primeiro link:
    const selectedLink = linksInfo.length > 0 ? linksInfo[0].href : null
    console.log(`\nLink que seria selecionado pelo scraper: ${selectedLink}`)
    
  } catch (err) {
    console.error('Erro:', err)
  } finally {
    await browser.close()
  }
}

main()
