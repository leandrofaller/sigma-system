import { chromium } from 'playwright'
import * as path from 'path'
import * as fs from 'fs'

const SIPE_URL = 'https://sipe.sejus.ro.gov.br'
const DEBUG_DIR = path.join(process.cwd(), '.debug-sipe')

async function debugSelecionarOpcao() {
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

    console.log('📍 Acessando /apenados/index...')
    await page.goto(`${SIPE_URL}/apenados/index`, { waitUntil: 'networkidle', timeout: 20_000 })

    // Procurar por links /selecionarOpcao
    console.log('🔍 Procurando links /selecionarOpcao...')
    const links = await page.locator('a[href*="/selecionarOpcao"]').evaluateAll(elems =>
      (elems as HTMLAnchorElement[])
        .slice(0, 5)
        .map(a => ({ href: a.href, text: a.textContent?.trim() }))
    )

    if (links.length > 0) {
      console.log(`✅ Encontrados ${links.length} links /selecionarOpcao:`)
      for (const link of links) {
        console.log(`  - ${link.href}`)
      }

      // Testar o primeiro link
      const firstLink = links[0].href
      console.log(`\n📍 Acessando: ${firstLink}`)
      
      const response = await page.goto(firstLink, { waitUntil: 'domcontentloaded', timeout: 15_000 })
      console.log(`Status: ${response?.status()}`)
      console.log(`URL atual: ${page.url()}`)

      const selectCount = await page.locator('select').count()
      console.log(`Selects: ${selectCount}`)

      if (selectCount > 0) {
        const selectsInfo = await page.evaluate(() =>
          Array.from(document.querySelectorAll('select')).map((s: any) => ({
            name: s.name,
            id: s.id,
            options: s.options.length,
            firstOptions: Array.from(s.options).slice(0, 3).map((o: any) => o.textContent?.trim())
          }))
        )
        console.log('\nSelects encontrados:')
        console.log(JSON.stringify(selectsInfo, null, 2))
      }
    } else {
      console.log('❌ Nenhum link /selecionarOpcao encontrado')
    }

  } catch (err) {
    console.error('\n❌ ERRO:', err)
  } finally {
    await browser.close()
  }
}

debugSelecionarOpcao().catch(console.error)
