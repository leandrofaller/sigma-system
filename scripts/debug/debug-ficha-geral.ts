/**
 * Debug: Testa a página /relatorios/fichaGeral para extrair facções
 */

import { chromium } from 'playwright'
import * as fs from 'fs'
import * as path from 'path'

const SIPE_URL = 'https://sipe.sejus.ro.gov.br'
const DEBUG_DIR = path.join(process.cwd(), '.debug-sipe')

async function debugFichaGeral() {
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext()
  const page = await context.newPage()

  try {
    if (!fs.existsSync(DEBUG_DIR)) {
      fs.mkdirSync(DEBUG_DIR, { recursive: true })
    }

    console.log('\n📍 Fazendo login...')
    await page.goto(`${SIPE_URL}/`, { waitUntil: 'networkidle', timeout: 30_000 })

    const user = process.env.SIPE_USER || 'usuario'
    const pwd = process.env.SIPE_PASSWORD || 'senha'

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
        try {
          await selectDropdown.selectOption({ label: 'Master' })
        } catch {
          const options = await selectDropdown.evaluate((select: HTMLSelectElement) => {
            return Array.from(select.options).map(opt => ({
              value: opt.value,
              text: opt.textContent?.trim()
            }))
          })
          const masterOpt = options.find(o => o.text?.includes('Master'))
          if (masterOpt) {
            await selectDropdown.selectOption(masterOpt.value)
          }
        }
      }
      const entrarBtn = page.locator('button:has-text("ENTRAR")')
      await entrarBtn.click()
      await page.waitForTimeout(2000)
    }

    if (page.url().includes('/selectRole')) {
      console.log('📍 Selecionando role...')
      const selectRole = page.locator('select').first()
      if (await selectRole.isVisible({ timeout: 5_000 }).catch(() => false)) {
        try {
          await selectRole.selectOption({ label: 'Master' })
        } catch {
          const options = await selectRole.evaluate((select: HTMLSelectElement) => {
            return Array.from(select.options).map(opt => ({
              value: opt.value,
              text: opt.textContent?.trim()
            }))
          })
          const masterOpt = options.find(o => o.text?.includes('Master'))
          if (masterOpt) {
            await selectRole.selectOption(masterOpt.value)
          }
        }
      }
      const entrarBtn = page.locator('button:has-text("ENTRAR")')
      await entrarBtn.click()
      await page.waitForTimeout(2000)
    }

    console.log('✅ Login completo\n')

    // Acessar fichaGeral com primeiro apenado
    const apenado_id = '64475'
    const url = `${SIPE_URL}/relatorios/fichaGeral?apenado=${apenado_id}`
    
    console.log(`📍 Acessando: ${url}`)
    await page.goto(url, { waitUntil: 'networkidle', timeout: 20_000 })
    console.log('✅ Página carregada\n')

    const html = await page.content()
    const htmlPath = path.join(DEBUG_DIR, 'ficha-geral-full.html')
    fs.writeFileSync(htmlPath, html)

    // Procurar por facção
    const temFaccao = html.toLowerCase().includes('faccao') || html.toLowerCase().includes('faction')
    console.log(`📊 HTML contém "faccao": ${temFaccao ? 'SIM' : 'NÃO'}\n`)

    const data = await page.evaluate(() => {
      return {
        url: window.location.href,
        title: document.title,
        bodyText: document.body.innerText.substring(0, 3000),
        formInputs: Array.from(document.querySelectorAll('input, select')).map(el => ({
          name: (el as any).name,
          value: (el as any).value,
          type: el.tagName
        })),
        allText: document.body.textContent?.substring(0, 2000)
      }
    })

    console.log('📋 Formulários/Inputs encontrados:')
    for (const input of data.formInputs.slice(0, 15)) {
      console.log(`  ${input.name}: ${input.value?.substring(0, 30)}`)
    }

    console.log('\n' + '═'.repeat(65))
    console.log('Primeiros 1000 chars do texto da página:')
    console.log('═'.repeat(65))
    console.log(data.allText?.substring(0, 1000))

    const savePath = path.join(DEBUG_DIR, 'ficha-geral-debug.json')
    fs.writeFileSync(savePath, JSON.stringify({
      url: data.url,
      title: data.title,
      temFaccao,
      tamanhoHTML: html.length,
      inputsCount: data.formInputs.length
    }, null, 2))

    console.log(`\n💾 Debug salvo em: ${savePath}`)
    console.log(`📄 HTML completo em: ${htmlPath}`)

  } catch (err: any) {
    console.error('\n❌ ERRO:', err.message)
  } finally {
    await browser.close()
  }
}

debugFichaGeral().catch(console.error)
