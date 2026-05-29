import { chromium } from 'playwright'

const SIPE_URL = 'https://sipe.sejus.ro.gov.br'
const TEST_APENADO_ID = '64475'

async function debugTodosSelects() {
  const browser = await chromium.launch({ headless: true })
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
        } catch {}
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

    console.log(`📍 /apenados/${TEST_APENADO_ID}/editar\n`)
    await page.goto(`${SIPE_URL}/apenados/${TEST_APENADO_ID}/editar`, {
      waitUntil: 'domcontentloaded',
      timeout: 15_000
    })

    const selects = await page.evaluate(() => {
      const allSelects = Array.from(document.querySelectorAll('select'))
      
      return allSelects.map((select, idx) => {
        const options = Array.from(select.options)
        
        // Procurar por opções que contenham nomes de facções
        const hasFaccao = options.some(o => {
          const text = o.textContent?.toLowerCase() || ''
          return text.includes('tcp') || 
                 text.includes('pcc') || 
                 text.includes('comando vermelho') ||
                 text.includes('bonde') ||
                 text.includes('facção')
        })

        return {
          index: idx,
          name: select.name,
          id: select.id,
          optionsCount: options.length,
          temFaccao: hasFaccao,
          opcoesCom Faccao: options
            .filter(o => {
              const text = o.textContent?.toLowerCase() || ''
              return text.includes('tcp') || 
                     text.includes('pcc') || 
                     text.includes('comando') ||
                     text.includes('bonde') ||
                     text.includes('facção')
            })
            .map(o => ({ value: o.value, text: o.textContent?.trim() })),
          primeirasOpcoes: options.slice(0, 5).map(o => ({ value: o.value, text: o.textContent?.trim() }))
        }
      })
    })

    console.log('═══════════════════════════════════════════════════════════════')
    console.log('TODOS OS SELECTS')
    console.log('═══════════════════════════════════════════════════════════════\n')

    for (const select of selects) {
      console.log(`[${select.index}] name="${select.name}" id="${select.id}" (${select.optionsCount} opções)`)
      if (select.temFaccao) {
        console.log(`    ✅ TEM FACÇÃO!`)
        console.log(`    Opções com facção:`)
        for (const opt of select['opcoesCom Faccao']) {
          console.log(`      - "${opt.text}" (value="${opt.value}")`)
        }
      } else {
        console.log(`    Primeiras opções: ${select.primeirasOpcoes.slice(0, 3).map(o => o.text).join(', ')}`)
      }
      console.log()
    }

  } catch (err) {
    console.error('\n❌ ERRO:', err)
  } finally {
    await browser.close()
  }
}

debugTodosSelects().catch(console.error)
