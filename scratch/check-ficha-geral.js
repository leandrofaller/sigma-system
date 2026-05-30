const { chromium } = require('playwright')
const fs = require('fs')
const path = require('path')

// Carrega o .env manualmente antes de inicializar as variáveis
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

const SIPE_URL = 'https://sipe.sejus.ro.gov.br'
const SIPE_CPF = process.env.SIPE_CPF ?? ''
const SIPE_SENHA = process.env.SIPE_SENHA ?? ''
const SIPE_PERFIL = process.env.SIPE_PERFIL ?? '2'
const SIPE_UNIDADE = '18' // PENITENCIÁRIA REGIONAL DE NOVA MAMORÉ

async function login(page, unidadeId) {
  await page.goto(`${SIPE_URL}/`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await page.waitForSelector('input[type="password"]', { timeout: 30_000 })

  const cpfInput =
    (await page.$('input[placeholder*="CPF"]')) ??
    (await page.$('input[name*="cpf"], input[name*="login"], input[type="text"]'))
  if (!cpfInput) {
    throw new Error(`Campo CPF não encontrado na página de login. URL atual: ${page.url()}`)
  }

  await cpfInput.fill(SIPE_CPF)
  await page.fill('input[type="password"]', SIPE_SENHA)

  const submitBtn =
    (await page.$('button[type="submit"]')) ??
    (await page.$('input[type="submit"]')) ??
    (await page.$('button'))
  if (!submitBtn) throw new Error('Botão de submit não encontrado na página de login')
  await submitBtn.click()

  try {
    await page.waitForURL('**/selectRole**', { timeout: 30_000 })
  } catch {
    const url = page.url()
    const bodyText = await page.innerText('body').catch(() => '')
    const errorMsg = bodyText.slice(0, 300).replace(/\s+/g, ' ').trim()
    throw new Error(
      `Login não redirecionou para /selectRole. URL atual: ${url}` +
      (errorMsg ? ` | Página: ${errorMsg}` : '')
    )
  }

  await page.locator('select').nth(0).waitFor({ state: 'attached', timeout: 10_000 })
  await page.locator('select').nth(1).waitFor({ state: 'attached', timeout: 10_000 })

  await page.evaluate((perfil) => {
    const selects = document.querySelectorAll('select')
    const selectPerfil = selects[0]
    if (selectPerfil) {
      selectPerfil.value = perfil
      selectPerfil.dispatchEvent(new Event('change', { bubbles: true }))
    }
  }, SIPE_PERFIL)

  try {
    await page.waitForFunction((unidade) => {
      const selects = document.querySelectorAll('select')
      const selectUnidade = selects[1]
      if (!selectUnidade) return false
      const options = Array.from(selectUnidade.options)
      return options.some(opt => opt.value === unidade)
    }, unidadeId, { timeout: 15_000 })
  } catch (err) {}

  await page.evaluate((unidade) => {
    const selects = document.querySelectorAll('select')
    const selectUnidade = selects[1]
    if (selectUnidade) {
      selectUnidade.value = unidade
      selectUnidade.dispatchEvent(new Event('change', { bubbles: true }))
    }
  }, unidadeId)

  await page.waitForTimeout(500)

  const submitBtn2 =
    (await page.$('button[type="submit"]')) ??
    (await page.$('input[type="submit"]')) ??
    (await page.$('button'))
  if (!submitBtn2) throw new Error('Botão de submit não encontrado na página selectRole')
  await submitBtn2.click()

  try {
    if (!page.url().includes('/home')) {
      await page.waitForURL('**/home**', { timeout: 30_000 })
    }
  } catch {
    const url = page.url()
    if (!url.includes('/home')) {
      throw new Error(`Seleção de perfil não redirecionou para /home. URL atual: ${url}`)
    }
  }

  return true
}

async function checkFichaGeral() {
  console.log('Iniciando teste de POST na Ficha Geral...')
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  })
  const page = await context.newPage()

  try {
    const logado = await login(page, SIPE_UNIDADE)
    if (!logado) {
      throw new Error('Falha de login no SIPE')
    }
    console.log('Login efetuado com sucesso!')

    const sipeId = 7441

    // 1. Acessa /home para carregar os cookies e o CSRF token
    await page.goto(`${SIPE_URL}/home`, { waitUntil: 'domcontentloaded' })
    
    // Obtém o token
    const token = await page.evaluate(() => {
      return (window).CSRF_TOKEN || document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || ''
    })
    console.log(`CSRF Token obtido: "${token}"`)

    // 2. Faz requisição POST via fetch na página
    console.log(`\n📡 Realizando requisição POST para ${SIPE_URL}/relatorios/fichaGeral...`)
    const postResult = await page.evaluate(async ({ url, sipeId, token }) => {
      try {
        const bodyParams = new URLSearchParams({
          _token: token,
          apenado: String(sipeId),
          apenado_id: String(sipeId),
          id: String(sipeId)
        })

        const res = await fetch(`${url}/relatorios/fichaGeral`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: bodyParams.toString()
        })

        const status = res.status
        const text = await res.text()
        return { status, textLength: text.length, html: text }
      } catch (err) {
        return { status: 0, error: err.message }
      }
    }, { url: SIPE_URL, sipeId, token })

    console.log(`Status do POST: ${postResult.status}`)
    if (postResult.error) {
      console.log(`Erro no POST fetch: ${postResult.error}`)
    } else {
      console.log(`Tamanho HTML retornado: ${postResult.textLength}`)
      fs.writeFileSync('scratch/ficha-geral-post-result.html', postResult.html)

      const isWhoops = postResult.html.includes('Whoops') || postResult.html.includes('something went wrong')
      console.log(`Whoops? ${isWhoops}`)
      
      if (!isWhoops && postResult.textLength > 1000) {
        console.log('Sucesso! Analisando se contém histórico de movimentações...')
        const containsMov = postResult.html.toLowerCase().includes('movimentac') || postResult.html.toLowerCase().includes('histórico')
        console.log(`Contém textos de movimentações/histórico no HTML? ${containsMov}`)

        // Vamos carregar o HTML obtido em uma página virtual ou usar regex simples para ver as tabelas
        const sampleText = postResult.html.substring(0, 1000).replace(/\s+/g, ' ')
        console.log('Amostra do HTML:', sampleText)
      } else if (isWhoops) {
        // Tenta extrair a mensagem de erro do HTML
        const match = postResult.html.match(/<h1>([\s\S]*?)<\/h1>/i)
        if (match) console.log('Erro H1:', match[1].trim())
      }
    }

  } catch (err) {
    console.error('Erro:', err)
  } finally {
    await browser.close()
  }
}

checkFichaGeral()
