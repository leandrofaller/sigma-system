import { chromium } from 'playwright'
import * as fs from 'fs'
import * as path from 'path'

const SIPE_URL = 'https://sipe.sejus.ro.gov.br'
const DEBUG_DIR = path.join(process.cwd(), '.debug-sipe')

async function debugIndexClick() {
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext()
  const page = await context.newPage()

  try {
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

    console.log('✅ Login completo\n')

    console.log('📍 Acessando /apenados/index...')
    await page.goto(`${SIPE_URL}/apenados/index`, {
      waitUntil: 'networkidle',
      timeout: 20_000
    })
    console.log('✅ Página carregada\n')

    // Procurar por links/botões clicáveis
    console.log('🔍 Procurando links de apenados...')
    const links = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('a, button, [onclick]'))
        .map(el => ({
          tag: el.tagName,
          text: el.textContent?.trim().substring(0, 50),
          href: (el as any).href || '',
          onclick: el.getAttribute('onclick') || '',
          class: el.className
        }))
        .filter(l => l.text && (l.href.includes('apenado') || l.onclick.includes('apenado') || l.text.match(/64475|RONES|editar|view|detalhes/i)))
        .slice(0, 20)
    })

    if (links.length > 0) {
      console.log(`✅ Encontrados ${links.length} links/botões de apenados:`)
      for (const link of links) {
        console.log(`  - ${link.tag} "${link.text}" href="${link.href}" onclick="${link.onclick.substring(0, 50)}"`)
      }
    } else {
      console.log('⚠️ Nenhum link de apenado encontrado')
    }

    // Tentar clicar no primeiro link de apenado
    const firstApenadoLink = await page.locator('tbody a').first()
    if (await firstApenadoLink.isVisible({ timeout: 2_000 }).catch(() => false)) {
      console.log('\n📍 Clicando no primeiro apenado...')
      
      const href = await firstApenadoLink.evaluate(el => (el as any).href)
      console.log(`  → ${href}`)
      
      await firstApenadoLink.click()
      await page.waitForLoadState('networkidle')
      await page.waitForTimeout(1000)

      const newUrl = page.url()
      console.log(`✅ Nova URL: ${newUrl}`)

      // Procurar por facção
      const hasFaccao = (await page.content()).toLowerCase().includes('faccao')
      const selectsCount = await page.locator('select').count()

      console.log(`\n📊 Página do apenado:`)
      console.log(`  - URL: ${newUrl}`)
      console.log(`  - Tem "faccao": ${hasFaccao}`)
      console.log(`  - Selects: ${selectsCount}`)

      // Salvar HTML
      const html = await page.content()
      const path1 = path.join(DEBUG_DIR, 'apenado-click-result.html')
      fs.writeFileSync(path1, html)
      console.log(`  - HTML salvo`)
    }

  } catch (err) {
    console.error('\n❌ ERRO:', err)
  } finally {
    await browser.close()
  }
}

debugIndexClick().catch(console.error)
