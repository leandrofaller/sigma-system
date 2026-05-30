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

async function inspectCandidatos() {
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
    const alvos = [
      { name: 'Cônjuge/Autorizações', url: `${SIPE_URL}/autorizacoes/${sipeId}/mostrar` },
      { name: 'Informações Adicionais', url: `${SIPE_URL}/apenados/${sipeId}/informacoes` },
      { name: 'Mudança de Celas', url: `${SIPE_URL}/apenados/${sipeId}/mudarcela` }
    ]

    for (const alvo of alvos) {
      console.log(`\n📍 Acessando ${alvo.name}: ${alvo.url}`)
      const res = await page.goto(alvo.url, { waitUntil: 'networkidle', timeout: 15_000 }).catch(() => null)
      if (res) {
        console.log(`  -> Status: ${res.status()}`)
        const html = await page.content()
        fs.writeFileSync(path.join(DEBUG_DIR, `candidato-${sipeId}-${alvo.name.replace('/', '_')}.html`), html)
        
        const tablesCount = await page.evaluate(() => document.querySelectorAll('table').length)
        const bodyText = await page.innerText('body').catch(() => '')
        
        console.log(`  -> Tabelas encontradas: ${tablesCount}`)
        console.log(`  -> Contém 'visitante': ${bodyText.toLowerCase().includes('visitante') || bodyText.toLowerCase().includes('visitantes')}`)
        console.log(`  -> Contém 'movimentação'/'histórico': ${bodyText.toLowerCase().includes('movimentac') || bodyText.toLowerCase().includes('histórico')}`)
        console.log(`  -> Contém 'cônjuge'/'esposa': ${bodyText.toLowerCase().includes('conjuge') || bodyText.toLowerCase().includes('esposa')}`)
        
        if (tablesCount > 0) {
          const tableDetails = await page.evaluate(() => {
            return Array.from(document.querySelectorAll('table')).map((t, i) => {
              const headers = Array.from(t.querySelectorAll('th, td')).slice(0, 10).map(el => el.textContent?.trim() || '')
              return {
                index: i,
                headers: headers.filter(h => h.length > 0).slice(0, 5),
                rowsCount: t.querySelectorAll('tr').length
              }
            })
          })
          console.log(`  -> Estrutura das tabelas:`, JSON.stringify(tableDetails))
        }
      } else {
        console.log(`  -> Falhou na navegação.`)
      }
    }

  } catch (err: any) {
    console.error('❌ Erro no teste:', err)
  } finally {
    await browser.close()
  }
}

inspectCandidatos()
