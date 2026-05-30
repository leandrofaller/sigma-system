import { chromium } from 'playwright'
import * as fs from 'fs'
import * as path from 'path'

const SIPE_URL = 'https://sipe.sejus.ro.gov.br'

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

async function inspectApenado() {
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext()
  const page = await context.newPage()

  try {
    console.log('📍 Fazendo login no SIPE...')
    await page.goto(`${SIPE_URL}/`, { waitUntil: 'networkidle', timeout: 30_000 })

    const user = process.env.SIPE_CPF
    const pwd = process.env.SIPE_SENHA
    
    if (!user || !pwd) {
      throw new Error('SIPE_CPF ou SIPE_SENHA não definidos no .env')
    }

    await page.waitForSelector('input[name="cpf"]', { timeout: 15_000 })
    await page.fill('input[name="cpf"]', user)
    await page.waitForSelector('input[type="password"]', { timeout: 5_000 })
    await page.fill('input[type="password"]', pwd)
    await page.click('button[type="submit"]')
    await page.waitForTimeout(2000)

    const perfilPage = await page
      .locator('text="Selecione o Perfil Desejado"')
      .isVisible({ timeout: 3_000 })
      .catch(() => false)

    if (perfilPage) {
      console.log('📍 Selecionando perfil...')
      const selectDropdown = page.locator('select').first()
      if (await selectDropdown.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await selectDropdown.selectOption({ label: 'Master' }).catch(() => {})
      }
      const entrarBtn = page.locator('button:has-text("ENTRAR")')
      await entrarBtn.click()
      await page.waitForTimeout(2000)
    }

    console.log('✅ Login completo. URL atual:', page.url())

    const sipeId = 7441
    console.log(`\n📍 Acessando página de edição do apenado ${sipeId}...`)
    await page.goto(`${SIPE_URL}/apenados/${sipeId}/editar`, { waitUntil: 'networkidle', timeout: 20_000 })

    // Extrair todos os links (href e texto) e botões da página de edição
    const pageElements = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('a')).map(a => ({
        text: a.textContent?.trim() || '',
        href: a.getAttribute('href') || '',
        id: a.id || '',
        class: a.className || ''
      }))

      const buttons = Array.from(document.querySelectorAll('button')).map(b => ({
        text: b.textContent?.trim() || '',
        onclick: b.getAttribute('onclick') || '',
        id: b.id || '',
        class: b.className || ''
      }))

      const forms = Array.from(document.querySelectorAll('form')).map(f => ({
        action: f.getAttribute('action') || '',
        method: f.getAttribute('method') || '',
        id: f.id || ''
      }))

      return { links, buttons, forms }
    })

    console.log('\n--- Links encontrados na página ---')
    pageElements.links.forEach(l => {
      if (l.href || l.text) {
        console.log(`Link: "${l.text}" -> href: "${l.href}" (id: ${l.id}, class: ${l.class})`)
      }
    })

    console.log('\n--- Botões encontrados na página ---')
    pageElements.buttons.forEach(b => {
      console.log(`Botão: "${b.text}" -> onclick: "${b.onclick}" (id: ${b.id}, class: ${b.class})`)
    })

    console.log('\n--- Forms encontrados na página ---')
    pageElements.forms.forEach(f => {
      console.log(`Form: action: "${f.action}", method: "${f.method}" (id: ${f.id})`)
    })

  } catch (err: any) {
    console.error('❌ Erro no teste:', err)
  } finally {
    await browser.close()
  }
}

inspectApenado()
