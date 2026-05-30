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

async function inspectFichaGeral() {
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

    const sipeId = 7441
    console.log(`\n📍 Acessando Ficha Geral do apenado ${sipeId}...`)
    const response = await page.goto(`${SIPE_URL}/relatorios/fichaGeral?apenado=${sipeId}`, { waitUntil: 'networkidle', timeout: 20_000 })
    console.log(`Status /fichaGeral: ${response?.status()}`)

    const htmlFicha = await page.content()
    fs.writeFileSync(path.join(DEBUG_DIR, `apenado-${sipeId}-fichaGeral.html`), htmlFicha)
    console.log(`Salvo html de /fichaGeral. Tamanho: ${htmlFicha.length} bytes`)

    const tablesInfo = await page.evaluate(() => {
      const tables = Array.from(document.querySelectorAll('table'))
      return tables.map((t, idx) => {
        const headers = Array.from(t.querySelectorAll('th, td')).slice(0, 10).map(el => el.textContent?.trim() || '')
        const text = t.textContent?.trim() || ''
        const rowsCount = t.querySelectorAll('tr').length
        return {
          index: idx,
          rowsCount,
          sampleText: text.substring(0, 100).replace(/\s+/g, ' '),
          headers: headers.filter(h => h.length > 0).slice(0, 5)
        }
      })
    })

    console.log(`\n📊 Encontradas ${tablesInfo.length} tabelas na Ficha Geral:`)
    tablesInfo.forEach(t => {
      console.log(`Tabela ${t.index}: Linhas: ${t.rowsCount} | Headers: [${t.headers.join(', ')}] | Conteúdo: "${t.sampleText}"`)
    })

    // Procurar por textos chaves no HTML completo
    const hasVisitante = htmlFicha.toLowerCase().includes('visitante') || htmlFicha.toLowerCase().includes('visitantes')
    const hasMovimentacao = htmlFicha.toLowerCase().includes('movimentacao') || htmlFicha.toLowerCase().includes('movimentações') || htmlFicha.toLowerCase().includes('histórico')
    console.log(`\n🔍 Busca textual no HTML de /fichaGeral:`)
    console.log(`Contém 'visitante': ${hasVisitante}`)
    console.log(`Contém 'movimentacao': ${hasMovimentacao}`)

  } catch (err: any) {
    console.error('❌ Erro no teste:', err)
  } finally {
    await browser.close()
  }
}

inspectFichaGeral()
