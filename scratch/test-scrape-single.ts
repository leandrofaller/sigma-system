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

async function testScrape() {
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

    // ID do apenado a testar: 7441 (de Nova Mamoré, do último job)
    const sipeId = 7441

    // 1. Testar página de edição
    console.log(`\n📍 Acessando página de edição do apenado ${sipeId}...`)
    const responseEdit = await page.goto(`${SIPE_URL}/apenados/${sipeId}/editar`, { waitUntil: 'networkidle', timeout: 20_000 })
    console.log(`Status /editar: ${responseEdit?.status()}`)
    const htmlEdit = await page.content()
    fs.writeFileSync(path.join(DEBUG_DIR, `apenado-${sipeId}-editar.html`), htmlEdit)
    console.log(`Salvo html de /editar. Tamanho: ${htmlEdit.length} bytes`)

    // Procura por abas ou tabelas de visitantes/histórico na própria página de edição
    const hasVisitantesText = htmlEdit.toLowerCase().includes('visitante') || htmlEdit.toLowerCase().includes('visitantes')
    const hasMovimentacoesText = htmlEdit.toLowerCase().includes('movimentacao') || htmlEdit.toLowerCase().includes('movimentações') || htmlEdit.toLowerCase().includes('histórico')
    console.log(`Contém texto 'visitante' em /editar: ${hasVisitantesText}`)
    console.log(`Contém texto 'movimentacao'/'historico' em /editar: ${hasMovimentacoesText}`)

    // 2. Testar página de visitantes
    console.log(`\n📍 Testando URLs de visitantes para o apenado ${sipeId}...`)
    const urlsVisitantes = [
      `${SIPE_URL}/apenados/${sipeId}/visitantes`,
      `${SIPE_URL}/apenados/${sipeId}/visitas`,
      `${SIPE_URL}/apenados/${sipeId}/credenciados`,
      `${SIPE_URL}/apenados/${sipeId}/credenciamento`
    ]
    for (const url of urlsVisitantes) {
      console.log(`Testando visitante: ${url}`)
      const res = await page.goto(url, { waitUntil: 'networkidle', timeout: 10_000 }).catch(() => null)
      if (res) {
        const text = await page.innerText('body').catch(() => '')
        const html = await page.content()
        const hasTable = html.includes('<table')
        console.log(`  -> Status: ${res.status()} | Tamanho: ${html.length} | Tem table: ${hasTable} | Contém 404: ${text.includes('404') || text.includes('não encontrado')}`)
        if (hasTable && res.status() === 200) {
          fs.writeFileSync(path.join(DEBUG_DIR, `apenado-${sipeId}-visitantes-ok.html`), html)
          console.log(`  -> [SUCESSO] Salvo HTML válido de visitantes.`)
        }
      } else {
        console.log(`  -> Falhou na navegação.`)
      }
    }

    // 3. Testar página de movimentações
    console.log(`\n📍 Testando URLs de movimentações para o apenado ${sipeId}...`)
    const urlsMovimentacoes = [
      `${SIPE_URL}/apenados/${sipeId}/movimentacoes`,
      `${SIPE_URL}/apenados/${sipeId}/historico`,
      `${SIPE_URL}/apenados/${sipeId}/movimentacao`,
      `${SIPE_URL}/apenados/${sipeId}/visitas` // às vezes visitas é o histórico carcerário
    ]
    for (const url of urlsMovimentacoes) {
      console.log(`Testando movimentações: ${url}`)
      const res = await page.goto(url, { waitUntil: 'networkidle', timeout: 10_000 }).catch(() => null)
      if (res) {
        const text = await page.innerText('body').catch(() => '')
        const html = await page.content()
        const hasTable = html.includes('<table')
        console.log(`  -> Status: ${res.status()} | Tamanho: ${html.length} | Tem table: ${hasTable} | Contém 404: ${text.includes('404') || text.includes('não encontrado')}`)
        if (hasTable && res.status() === 200) {
          fs.writeFileSync(path.join(DEBUG_DIR, `apenado-${sipeId}-movimentacoes-ok.html`), html)
          console.log(`  -> [SUCESSO] Salvo HTML válido de movimentações.`)
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

testScrape()
