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

    console.log('Acessando /editar do apenado #9347...')
    await page.goto(`${SIPE_URL}/apenados/9347/editar`, { waitUntil: 'domcontentloaded', timeout: 20000 })

    const elements = await page.evaluate(() => {
      const all = document.querySelectorAll('*')
      const result: { tag: string; name: string; id: string; value: string; text: string; type: string }[] = []
      
      all.forEach(el => {
        const nameAttr = el.getAttribute('name') || ''
        const idAttr = el.id || ''
        const textContent = el.textContent?.trim() || ''
        
        if (
          nameAttr.toLowerCase().includes('faccao') ||
          idAttr.toLowerCase().includes('faccao')
        ) {
          result.push({
            tag: el.tagName,
            name: nameAttr,
            id: idAttr,
            value: (el as HTMLInputElement).value || '',
            text: textContent.substring(0, 100),
            type: el.getAttribute('type') || ''
          })
        }
      })
      return result
    })

    console.log('=== ELEMENTOS COM "FACCAO" NO EDITAR ===')
    console.log(elements)

  } catch (err) {
    console.error('Erro:', err)
  } finally {
    await browser.close()
  }
}

main()
