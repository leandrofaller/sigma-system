import { chromium } from 'playwright'
import * as path from 'path'
import * as fs from 'fs'

const SIPE_URL = 'https://sipe.sejus.ro.gov.br'
const DEBUG_DIR = path.join(process.cwd(), '.debug-sipe')
const TEST_APENADO_ID = '64475'

async function debugNetwork() {
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext()
  const page = await context.newPage()

  const requests: any[] = []
  
  // Capturar todas as requisições
  page.on('request', (request) => {
    requests.push({
      url: request.url(),
      method: request.method(),
      resourceType: request.resourceType(),
      timestamp: new Date().toISOString()
    })
  })

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

    requests.length = 0 // Limpar requests anteriores

    console.log(`📍 Acessando /apenados/${TEST_APENADO_ID}/editar...`)
    await page.goto(`${SIPE_URL}/apenados/${TEST_APENADO_ID}/editar`, {
      waitUntil: 'networkidle',
      timeout: 15_000
    })

    console.log('✅ Página carregada\n')

    console.log('═══════════════════════════════════════════════════════════════')
    console.log('REQUISIÇÕES DE REDE')
    console.log('═══════════════════════════════════════════════════════════════\n')

    // Procurar por requisições relacionadas a facção
    const faccaoRequests = requests.filter(r => r.url.toLowerCase().includes('fac'))
    const apiRequests = requests.filter(r => r.url.includes('/api/') || r.url.includes('.json'))
    const xhrRequests = requests.filter(r => r.resourceType === 'xhr' || r.resourceType === 'fetch')

    if (faccaoRequests.length > 0) {
      console.log(`✅ Requisições com "fac" (${faccaoRequests.length}):`)
      for (const req of faccaoRequests) {
        console.log(`  - ${req.method} ${req.url}`)
      }
    } else {
      console.log('❌ Nenhuma requisição com "fac"')
    }

    if (apiRequests.length > 0) {
      console.log(`\n📋 Requisições de API (${apiRequests.length}):`)
      for (const req of apiRequests.slice(0, 10)) {
        console.log(`  - ${req.method} ${req.url}`)
      }
    } else {
      console.log('\n❌ Nenhuma requisição de API encontrada')
    }

    if (xhrRequests.length > 0) {
      console.log(`\n🔌 Requisições XHR/Fetch (${xhrRequests.length}):`)
      for (const req of xhrRequests.slice(0, 10)) {
        console.log(`  - ${req.method} ${req.url}`)
      }
    }

    console.log(`\n📊 Total de requisições: ${requests.length}`)

    // Salvar log completo
    const logPath = path.join(DEBUG_DIR, 'network-requests.json')
    fs.writeFileSync(logPath, JSON.stringify({
      total: requests.length,
      faccaoRequests: faccaoRequests.length,
      apiRequests: apiRequests.length,
      xhrRequests: xhrRequests.length,
      allRequests: requests.slice(0, 50)
    }, null, 2))

    console.log(`\n💾 Log salvo em: ${logPath}`)

  } catch (err) {
    console.error('\n❌ ERRO:', err)
  } finally {
    await browser.close()
  }
}

debugNetwork().catch(console.error)
