import { chromium } from 'playwright'
import * as fs from 'fs'
import * as path from 'path'

const DEBUG_DIR = path.join(process.cwd(), '.debug-sipe-test')
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

async function testVisitantes() {
  console.log('🚀 Iniciando teste de navegação para a página de mostra da visita...')
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext()
  const page = await context.newPage()

  try {
    if (!fs.existsSync(DEBUG_DIR)) {
      fs.mkdirSync(DEBUG_DIR, { recursive: true })
    }

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

    // Acessa a página de mostra da visita 11114
    const visitaId = 11114
    const urlMostra = `${SIPE_URL}/visitas/entrada/mostra/${visitaId}`
    console.log(`\n📍 Acessando página: ${urlMostra}`)
    await page.goto(urlMostra, { waitUntil: 'networkidle', timeout: 20_000 })

    const html = await page.content()
    fs.writeFileSync(path.join(DEBUG_DIR, `visitas-entrada-mostra-${visitaId}.html`), html)
    console.log(`💾 HTML salvo em visitas-entrada-mostra-${visitaId}.html. Tamanho: ${html.length} bytes`)

    const imgs = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('img')).map(img => ({
        src: img.src,
        alt: img.alt,
        id: img.id,
        className: img.className,
        style: img.getAttribute('style')
      }))
    })

    console.log(`\n📊 Imagens encontradas na página (${imgs.length}):`)
    console.log(JSON.stringify(imgs, null, 2))

  } catch (err: any) {
    console.error('❌ Erro no teste:', err)
  } finally {
    await browser.close()
    console.log('🏁 Teste finalizado.')
  }
}

testVisitantes()
