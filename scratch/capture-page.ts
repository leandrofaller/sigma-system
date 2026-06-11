import { chromium } from 'playwright'
import dotenv from 'dotenv'
import { writeFileSync } from 'fs'
dotenv.config()

const SIPE_URL = 'https://sipe.sejus.ro.gov.br'
const SIPE_CPF = process.env.SIPE_CPF ?? ''
const SIPE_SENHA = process.env.SIPE_SENHA ?? ''
const SIPE_PERFIL = process.env.SIPE_PERFIL ?? '2'
const SIPE_UNIDADE = process.env.SIPE_UNIDADE ?? '3'

async function main() {
  console.log(`Iniciando login no SIPE com CPF: ${SIPE_CPF}...`)
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()
  
  try {
    await page.goto(`${SIPE_URL}/login`, { waitUntil: 'domcontentloaded', timeout: 60000 })
    
    // Esperar formulário
    await page.waitForSelector('input[type="password"]', { timeout: 15000 })
    
    const cpfInput = await page.$('input[placeholder*="CPF"], input[name*="cpf"], input[type="text"]')
    if (cpfInput) {
      await cpfInput.fill(SIPE_CPF)
    }
    await page.fill('input[type="password"]', SIPE_SENHA)
    
    // Clicar e aguardar login
    const submitBtn = await page.$('button[type="submit"], input[type="submit"]')
    await submitBtn?.click()
    
    await page.waitForURL('**/selectRole**', { timeout: 30000 })
    console.log('Chegou na tela de seleção de papel (selectRole).')
    
    await page.locator('select').nth(0).waitFor({ state: 'attached', timeout: 10000 })
    await page.locator('select').nth(1).waitFor({ state: 'attached', timeout: 10000 })
    
    // Selecionar perfil
    await page.evaluate((perfil) => {
      const selects = document.querySelectorAll('select')
      const selectPerfil = selects[0] as HTMLSelectElement
      if (selectPerfil) {
        selectPerfil.value = perfil
        selectPerfil.dispatchEvent(new Event('change', { bubbles: true }))
      }
    }, SIPE_PERFIL)
    
    // Aguardar opção do segundo select
    await page.waitForFunction((unidade) => {
      const selects = document.querySelectorAll('select')
      const selectUnidade = selects[1] as HTMLSelectElement
      if (!selectUnidade) return false
      return Array.from(selectUnidade.options).some(opt => opt.value === unidade)
    }, SIPE_UNIDADE, { timeout: 15000 })
    
    // Selecionar unidade
    await page.evaluate((unidade) => {
      const selects = document.querySelectorAll('select')
      const selectUnidade = selects[1] as HTMLSelectElement
      if (selectUnidade) {
        selectUnidade.value = unidade
        selectUnidade.dispatchEvent(new Event('change', { bubbles: true }))
      }
    }, SIPE_UNIDADE)
    
    await page.waitForTimeout(1000)
    
    const submitBtn2 = await page.$('button[type="submit"], input[type="submit"]')
    await submitBtn2?.click()
    
    await page.waitForURL('**/home**', { timeout: 30000 })
    console.log('Login concluído com sucesso e redirecionado para /home!')
    
    const sipeId = 41920
    console.log(`Selecionando o apenado ${sipeId} na sessão...`)
    await page.goto(`${SIPE_URL}/apenados/${sipeId}/selecionarOpcao`, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {})
    
    console.log(`Navegando para editar o apenado ${sipeId}...`)
    const response = await page.goto(`${SIPE_URL}/apenados/${sipeId}/editar`, { waitUntil: 'domcontentloaded', timeout: 30000 })
    
    console.log('URL final:', page.url())
    console.log('Status da resposta:', response?.status())
    
    const html = await page.content()
    writeFileSync('scratch/abdiel-playwright.html', html)
    console.log('HTML salvo em scratch/abdiel-playwright.html')
    
    await page.screenshot({ path: 'scratch/abdiel-screenshot.png', fullPage: true })
    console.log('Screenshot salvo em scratch/abdiel-screenshot.png')
    
  } catch (err) {
    console.error('Erro no script:', err)
  } finally {
    await browser.close()
  }
}

main()
