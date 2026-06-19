import { chromium } from 'playwright'
import * as fs from 'fs'
import * as path from 'path'

const SIPE_URL = 'https://sipe.sejus.ro.gov.br'
const DEBUG_DIR = path.join(process.cwd(), '.debug-sipe')
const TEST_APENADO_ID = '64475'

async function debugScraperSim() {
  const browser = await chromium.launch({ headless: false })
  const context = await browser.newContext()
  const page = await context.newPage()

  try {
    console.log('\n📍 LOGIN...')
    await page.goto(`${SIPE_URL}/`, { waitUntil: 'networkidle', timeout: 30_000 })

    const user = process.env.SIPE_USER || 'usuario'
    const pwd = process.env.SIPE_PASSWORD || 'senha'

    await page.waitForSelector('input[name="cpf"]', { timeout: 15_000 })
    await page.fill('input[name="cpf"]', user)
    await page.waitForSelector('input[type="password"]', { timeout: 5_000 })
    await page.fill('input[type="password"]', pwd)
    await page.click('button[type="submit"]')
    await page.waitForTimeout(2000)

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
      await page.locator('button:has-text("ENTRAR")').click()
      await page.waitForTimeout(2000)
    }

    if (page.url().includes('/selectRole')) {
      const selectRole = page.locator('select').first()
      if (await selectRole.isVisible({ timeout: 5_000 }).catch(() => false)) {
        try {
          await selectRole.selectOption({ label: 'Master' })
        } catch {}
      }
      await page.locator('button:has-text("ENTRAR")').click()
      await page.waitForTimeout(2000)
    }

    console.log('✅ LOGIN OK\n')

    // TENTATIVA 1: /apenados/{id}/faccao
    console.log('═══════════════════════════════════════════════════════════════')
    console.log('TENTATIVA 1: /apenados/{id}/faccao')
    console.log('═══════════════════════════════════════════════════════════════\n')

    console.log(`📍 Navegando para: ${SIPE_URL}/apenados/${TEST_APENADO_ID}/faccao`)
    
    const response1 = await page.goto(`${SIPE_URL}/apenados/${TEST_APENADO_ID}/faccao`, {
      waitUntil: 'load',
      timeout: 20_000
    })

    console.log(`Status: ${response1?.status()}`)
    console.log(`URL atual: ${page.url()}`)
    console.log(`Title: ${await page.title()}`)

    const selectCount1 = await page.locator('select').count()
    console.log(`\nSelects encontrados: ${selectCount1}`)

    if (selectCount1 > 0) {
      const firstSelect = await page.locator('select').first()
      const name = await firstSelect.evaluate(e => (e as any).name)
      const opts = await firstSelect.locator('option').count()
      console.log(`  - Primeiro select: name="${name}" (${opts} opções)`)
    }

    // TENTATIVA 2: /apenados/{id}/editar
    console.log('\n═══════════════════════════════════════════════════════════════')
    console.log('TENTATIVA 2: /apenados/{id}/editar')
    console.log('═══════════════════════════════════════════════════════════════\n')

    console.log(`📍 Navegando para: ${SIPE_URL}/apenados/${TEST_APENADO_ID}/editar`)
    
    const response2 = await page.goto(`${SIPE_URL}/apenados/${TEST_APENADO_ID}/editar`, {
      waitUntil: 'domcontentloaded',
      timeout: 15_000
    })

    console.log(`Status: ${response2?.status()}`)
    console.log(`URL atual: ${page.url()}`)
    console.log(`Title: ${await page.title()}`)

    const selectCount2 = await page.locator('select').count()
    console.log(`\nSelects encontrados: ${selectCount2}`)

    const selectors = [
      'select[name="faccao_id"]',
      'select[name*="faccao"]',
      'select[id*="faccao"]'
    ]

    for (const sel of selectors) {
      const count = await page.locator(sel).count()
      if (count > 0) {
        console.log(`  ✓ ${sel} → ${count}`)
      } else {
        console.log(`  ✗ ${sel}`)
      }
    }

    // Procurar por input hidden
    console.log(`\nInputs hidden:`)
    const hiddenInputs = await page.locator('input[type="hidden"]').evaluateAll(inputs =>
      (inputs as HTMLInputElement[])
        .filter(i => i.name.includes('fac'))
        .map(i => ({ name: i.name, value: i.value }))
    )

    if (hiddenInputs.length > 0) {
      for (const inp of hiddenInputs) {
        console.log(`  - name="${inp.name}" value="${inp.value}"`)
      }
    } else {
      console.log('  (nenhum)')
    }

    console.log('\n💾 Abrindo página em navegador para inspeção...')
    await page.waitForTimeout(60000) // Espera 1 minuto para você inspecionar

  } catch (err) {
    console.error('\n❌ ERRO:', err)
  } finally {
    await browser.close()
  }
}

debugScraperSim().catch(console.error)
