import { chromium } from 'playwright'
import * as fs from 'fs'
import * as path from 'path'

const SIPE_URL = 'https://sipe.sejus.ro.gov.br'
const DEBUG_DIR = path.join(process.cwd(), '.debug-sipe-test')

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

async function inspectEnderecos() {
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

    const sipeId = 7441
    const urlSingular = `${SIPE_URL}/apenados/${sipeId}/endereco`
    const urlPlural = `${SIPE_URL}/apenados/${sipeId}/enderecos`

    console.log(`\n📍 Testando endereço singular: ${urlSingular}`)
    const resSingular = await page.goto(urlSingular, { waitUntil: 'domcontentloaded', timeout: 10_000 }).catch(() => null)
    if (resSingular) {
      console.log(`  -> Status: ${resSingular.status()} | Tamanho: ${(await page.content()).length} bytes`)
    } else {
      console.log(`  -> Falhou na navegação.`)
    }

    console.log(`\n📍 Testando endereço plural: ${urlPlural}`)
    const resPlural = await page.goto(urlPlural, { waitUntil: 'networkidle', timeout: 15_000 }).catch(() => null)
    if (resPlural) {
      const html = await page.content()
      fs.writeFileSync(path.join(DEBUG_DIR, `apenado-${sipeId}-enderecos-plural.html`), html)
      console.log(`  -> Status: ${resPlural.status()} | Tamanho: ${html.length} bytes`)
      
      const elements = await page.evaluate(() => {
        const inputs = Array.from(document.querySelectorAll('input, select')).map(el => ({
          name: (el as any).name,
          value: (el as any).value,
          tagName: el.tagName
        }))
        const tables = document.querySelectorAll('table').length
        return { inputs, tables }
      })

      console.log(`  -> Tabelas encontradas: ${elements.tables}`)
      console.log(`  -> Inputs/Selects encontrados na tela:`, JSON.stringify(elements.inputs.slice(0, 20)))
    } else {
      console.log(`  -> Falhou na navegação.`)
    }

  } catch (err: any) {
    console.error('❌ Erro no teste:', err)
  } finally {
    await browser.close()
  }
}

inspectEnderecos()
