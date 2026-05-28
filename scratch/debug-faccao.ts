import { chromium } from 'playwright'
import fs from 'fs'
import path from 'path'

// Função simples para carregar o .env
function loadEnv() {
  const envPath = path.join(process.cwd(), '.env')
  if (!fs.existsSync(envPath)) {
    console.error('Arquivo .env não encontrado!')
    return
  }
  const content = fs.readFileSync(envPath, 'utf8')
  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const parts = trimmed.split('=')
    const key = parts[0].trim()
    const value = parts.slice(1).join('=').trim()
    process.env[key] = value
  }
}

async function debugFaccao() {
  loadEnv()

  const SIPE_URL = 'https://sipe.sejus.ro.gov.br'
  const SIPE_CPF = process.env.SIPE_CPF ?? ''
  const SIPE_SENHA = process.env.SIPE_SENHA ?? ''
  const SIPE_PERFIL = process.env.SIPE_PERFIL ?? '2'
  const SIPE_UNIDADE = process.env.SIPE_UNIDADE ?? '3'

  console.log('CPF:', SIPE_CPF ? 'Preenchido' : 'Vazio')
  console.log('Senha:', SIPE_SENHA ? 'Preenchida' : 'Vazia')

  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  })
  const page = await context.newPage()

  try {
    console.log('Navegando para o login...')
    await page.goto(`${SIPE_URL}/`, { waitUntil: 'domcontentloaded', timeout: 60000 })
    await page.waitForSelector('input[type="password"]', { timeout: 30000 })

    const cpfInput = (await page.$('input[placeholder*="CPF"]')) ??
                     (await page.$('input[name*="cpf"], input[name*="login"], input[type="text"]'))
    if (!cpfInput) throw new Error('CPF input not found')
    await cpfInput.fill(SIPE_CPF)
    await page.fill('input[type="password"]', SIPE_SENHA)

    const submitBtn = (await page.$('button[type="submit"]')) ??
                      (await page.$('input[type="submit"]')) ??
                      (await page.$('button'))
    if (!submitBtn) throw new Error('Submit button not found')
    await submitBtn.click()

    console.log('Aguardando redirecionamento para selectRole...')
    await page.waitForURL('**/selectRole**', { timeout: 30000 })

    await page.locator('select').nth(0).waitFor({ state: 'attached', timeout: 10000 })
    await page.locator('select').nth(1).waitFor({ state: 'attached', timeout: 10000 })

    // Seleciona perfil
    await page.evaluate((perfil) => {
      const selects = document.querySelectorAll('select')
      const selectPerfil = selects[0] as HTMLSelectElement
      if (selectPerfil) {
        selectPerfil.value = perfil
        selectPerfil.dispatchEvent(new Event('change', { bubbles: true }))
      }
    }, SIPE_PERFIL)

    // Aguarda e seleciona unidade
    await page.evaluate((unidade) => {
      const selects = document.querySelectorAll('select')
      const selectUnidade = selects[1] as HTMLSelectElement
      if (selectUnidade) {
        selectUnidade.value = unidade
        selectUnidade.dispatchEvent(new Event('change', { bubbles: true }))
      }
    }, SIPE_UNIDADE)

    await page.waitForTimeout(1000)
    const submitBtn2 = (await page.$('button[type="submit"]')) ?? (await page.$('button'))
    if (submitBtn2) await submitBtn2.click()

    console.log('Aguardando redirecionamento para home...')
    await page.waitForURL('**/home**', { timeout: 30000 })

    console.log('Login feito com sucesso! Indo para listagem de apenados...')
    await page.goto(`${SIPE_URL}/apenados/index`, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('tbody', { timeout: 15000 })

    const firstLink = await page.$('tbody a[href*="/selecionarOpcao"]')
    if (!firstLink) {
      console.log('Nenhum link de apenado encontrado na listagem!')
      return
    }

    const href = await firstLink.getAttribute('href')
    if (!href) {
      console.log('Href do primeiro apenado está vazio')
      return
    }
    console.log('Href encontrado:', href)
    const m = href.match(/\/apenados\/(\d+)\//)
    if (!m) {
      console.log('Não foi possível extrair o ID do apenado do href:', href)
      return
    }
    const apenadoId = parseInt(m[1])
    console.log('ID do Apenado extraído:', apenadoId)

    // Testa a URL de facções
    const faccaoUrl = `${SIPE_URL}/apenados/${apenadoId}/faccao`
    console.log('Indo para a URL de facção:', faccaoUrl)
    const response = await page.goto(faccaoUrl, { waitUntil: 'domcontentloaded', timeout: 30000 })
    console.log('Status da resposta:', response?.status())
    
    const currentUrl = page.url()
    console.log('URL atual após navegação:', currentUrl)

    const textContent = await page.innerText('body').catch(() => '')
    console.log('Texto inicial do body (primeiros 400 caracteres):')
    console.log(textContent.slice(0, 400).replace(/\s+/g, ' '))

    // Verifica quais selects existem na página de facções
    const selectCount = await page.evaluate(() => {
      const selects = document.querySelectorAll('select')
      return Array.from(selects).map(s => ({
        id: s.id,
        name: s.name,
        optionsCount: s.options.length,
        options: Array.from(s.options).map(o => ({ value: o.value, text: o.text }))
      }))
    })

    console.log('Selects encontrados na página de facção:', JSON.stringify(selectCount, null, 2))

    // Vamos testar também a página de editar para ver se nela existe o select de facção
    const editarUrl = `${SIPE_URL}/apenados/${apenadoId}/editar`
    console.log('Testando também a URL de edição para ver se há facções:', editarUrl)
    await page.goto(editarUrl, { waitUntil: 'domcontentloaded', timeout: 30000 })
    
    const selectsEditar = await page.evaluate(() => {
      const selects = document.querySelectorAll('select')
      return Array.from(selects).map(s => ({
        id: s.id,
        name: s.name,
        optionsCount: s.options.length,
        options: Array.from(s.options).map(o => ({ value: o.value, text: o.text })).slice(0, 5) // primeiras 5 opções
      }))
    })
    console.log('Selects encontrados na página de edição (primeras 5 opções por select):')
    console.log(JSON.stringify(selectsEditar, null, 2))

  } catch (error) {
    console.error('Erro durante o diagnóstico:', error)
  } finally {
    await browser.close()
  }
}

debugFaccao()
