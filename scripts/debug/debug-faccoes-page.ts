/**
 * Script de debug: Inspecionar a página /apenados/{id}/faccao
 */

import { chromium } from 'playwright'
import * as fs from 'fs'
import * as path from 'path'

const SIPE_URL = 'https://sipe.sejus.ro.gov.br'
const DEBUG_DIR = path.join(process.cwd(), '.debug-sipe')
const TEST_APENADO_ID = '64475'

async function debugFaccaoPage() {
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

    // Perfil
    const perfilPage = await page.locator('text="Selecione o Perfil Desejado"').isVisible({ timeout: 3_000 }).catch(() => false)
    if (perfilPage) {
      const selectDropdown = page.locator('select').first()
      if (await selectDropdown.isVisible({ timeout: 5_000 }).catch(() => false)) {
        try {
          await selectDropdown.selectOption({ label: 'Master' })
        } catch {
          const options = await selectDropdown.evaluate((select: HTMLSelectElement) => 
            Array.from(select.options).map(opt => ({ value: opt.value, text: opt.textContent?.trim() }))
          )
          const masterOpt = options.find(o => o.text?.includes('Master'))
          if (masterOpt) await selectDropdown.selectOption(masterOpt.value)
        }
      }
      const entrarBtn = page.locator('button:has-text("ENTRAR")')
      await entrarBtn.click()
      await page.waitForTimeout(2000)
    }

    // Role
    if (page.url().includes('/selectRole')) {
      const selectRole = page.locator('select').first()
      if (await selectRole.isVisible({ timeout: 5_000 }).catch(() => false)) {
        try {
          await selectRole.selectOption({ label: 'Master' })
        } catch {
          const options = await selectRole.evaluate((select: HTMLSelectElement) => 
            Array.from(select.options).map(opt => ({ value: opt.value, text: opt.textContent?.trim() }))
          )
          const masterOpt = options.find(o => o.text?.includes('Master'))
          if (masterOpt) await selectRole.selectOption(masterOpt.value)
        }
      }
      const entrarBtn = page.locator('button:has-text("ENTRAR")')
      await entrarBtn.click()
      await page.waitForTimeout(2000)
    }

    console.log('✅ Login completo\n')

    console.log(`📍 Acessando /apenados/${TEST_APENADO_ID}/faccao...`)
    await page.goto(`${SIPE_URL}/apenados/${TEST_APENADO_ID}/faccao`, {
      waitUntil: 'domcontentloaded',
      timeout: 15_000
    })
    console.log('✅ Página carregada\n')

    // Salvar HTML
    const html = await page.content()
    const htmlPath = path.join(DEBUG_DIR, 'apenado-faccao.html')
    fs.writeFileSync(htmlPath, html)
    console.log(`📄 HTML salvo\n`)

    // Análise
    const analysis = await page.evaluate(() => {
      const selects = Array.from(document.querySelectorAll('select'))
      const inputs = Array.from(document.querySelectorAll('input'))
      
      const selectsInfo = selects.map((select, idx) => {
        const options = Array.from(select.options).map(opt => ({
          value: opt.value,
          text: opt.textContent?.trim()
        }))
        return {
          index: idx,
          name: select.name || '(sem)',
          id: select.id || '(sem)',
          optionsCount: options.length,
          selected: select.options[select.selectedIndex]?.textContent?.trim(),
          options: options.slice(0, 15)
        }
      })

      const inputsInfo = inputs.map((inp, idx) => ({
        index: idx,
        type: inp.type,
        name: inp.name,
        id: inp.id,
        value: inp.value.substring(0, 100)
      }))

      return {
        selectsCount: selects.length,
        selects: selectsInfo,
        inputsCount: inputs.length,
        inputs: inputsInfo,
        title: document.title,
        url: window.location.href
      }
    })

    console.log('═══════════════════════════════════════════════════════════════════')
    console.log('📊 ANÁLISE')
    console.log('═══════════════════════════════════════════════════════════════════\n')

    console.log(`Selects: ${analysis.selectsCount}`)
    for (const sel of analysis.selects) {
      console.log(`  [${sel.index}] "${sel.name}" (${sel.optionsCount} opções)`)
      console.log(`      Selecionado: "${sel.selected}"`)
      console.log(`      Opções: ${sel.options.slice(0, 3).map(o => o.text).join(', ')}${sel.options.length > 3 ? '...' : ''}`)
    }

    console.log(`\nInputs: ${analysis.inputsCount}`)
    for (const inp of analysis.inputs.slice(0, 10)) {
      console.log(`  [${inp.index}] <input type="${inp.type}" name="${inp.name}" value="${inp.value}">`)
    }

    // Salvar análise
    const analysisPath = path.join(DEBUG_DIR, 'apenado-faccao-analysis.json')
    fs.writeFileSync(analysisPath, JSON.stringify(analysis, null, 2))

    console.log(`\n💾 Análise salva`)

  } catch (err) {
    console.error('\n❌ ERRO:', err)
  } finally {
    await browser.close()
  }
}

debugFaccaoPage().catch(console.error)
