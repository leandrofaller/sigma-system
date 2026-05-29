import { chromium } from 'playwright'

const SIPE_URL = 'https://sipe.sejus.ro.gov.br'

async function main() {
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext()
  const page = await context.newPage()

  try {
    console.log('Fazendo login...')
    await page.goto(`${SIPE_URL}/`, { waitUntil: 'networkidle' })

    const user = process.env.SIPE_CPF || '77032055249'
    const pwd = process.env.SIPE_SENHA || 'jxa7HWK@axw*mtw3avg'

    await page.fill('input[name="cpf"]', user)
    await page.fill('input[type="password"]', pwd)
    await page.click('button[type="submit"]')
    await page.waitForTimeout(2000)

    const perfilPage = await page.locator('text="Selecione o Perfil Desejado"').isVisible({ timeout: 3000 }).catch(() => false)
    if (perfilPage) {
      const selectDropdown = page.locator('select').first()
      await selectDropdown.selectOption({ label: 'Master' })
      await page.locator('button:has-text("ENTRAR")').click()
      await page.waitForTimeout(2000)
    }

    if (page.url().includes('/selectRole')) {
      const selectRole = page.locator('select').first()
      await selectRole.selectOption({ label: 'Master' })
      await page.locator('button:has-text("ENTRAR")').click()
      await page.waitForTimeout(2000)
    }

    console.log('Login feito. Acessando apenado #9347 para inspecionar select de facções...')
    await page.goto(`${SIPE_URL}/apenados/9347/faccao`, { waitUntil: 'load', timeout: 20000 })

    const options = await page.evaluate(() => {
      const select = document.querySelector('select[name="faccao_id"]') || document.querySelector('select')
      if (!select) return []
      return Array.from(select.querySelectorAll('option')).map(opt => ({
        value: opt.value,
        text: opt.textContent?.trim() || ''
      }))
    })

    console.log('=== OPÇÕES DO DROPDOWN DE FACÇÕES ===')
    console.log(options)

  } catch (err) {
    console.error('Erro:', err)
  } finally {
    await browser.close()
  }
}

main()
