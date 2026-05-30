import { chromium } from 'playwright'
import fs from 'fs'
import path from 'path'

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
const SIPE_UNIDADE = process.env.SIPE_UNIDADE ?? '3'

async function login(page: any, unidadeId: string): Promise<boolean> {
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

  await page.evaluate((perfil: string) => {
    const selects = document.querySelectorAll('select')
    const selectPerfil = selects[0] as HTMLSelectElement
    if (selectPerfil) {
      selectPerfil.value = perfil
      selectPerfil.dispatchEvent(new Event('change', { bubbles: true }))
    }
  }, SIPE_PERFIL)

  try {
    await page.waitForFunction((unidade: string) => {
      const selects = document.querySelectorAll('select')
      const selectUnidade = selects[1] as HTMLSelectElement
      if (!selectUnidade) return false
      const options = Array.from(selectUnidade.options)
      return options.some(opt => opt.value === unidade)
    }, unidadeId, { timeout: 15_000 })
  } catch (err) {}

  await page.evaluate((unidade: string) => {
    const selects = document.querySelectorAll('select')
    const selectUnidade = selects[1] as HTMLSelectElement
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
  console.log('Iniciando teste de Ficha Geral com login oficial...')
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

    // 1. Acessa a listagem primeiro
    await page.goto(`${SIPE_URL}/apenados/index`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1000)

    // 2. Acessa /relatorios/fichaGeral via GET
    console.log(`\n📍 GET: ${SIPE_URL}/relatorios/fichaGeral`)
    let res = await page.goto(`${SIPE_URL}/relatorios/fichaGeral`, { waitUntil: 'domcontentloaded', timeout: 30000 })
    console.log(`Status GET FichaGeral base: ${res?.status()}`)
    let html = await page.content()
    console.log(`Tamanho HTML: ${html.length}`)
    fs.writeFileSync('scratch/ficha-geral-base.html', html)

    // Inspeciona formulários
    const formsInfo = await page.evaluate(() => {
      const forms = Array.from(document.querySelectorAll('form'))
      return forms.map((f, idx) => {
        const inputs = Array.from(f.querySelectorAll('input, select, textarea')).map(el => ({
          name: (el as any).name,
          id: el.id,
          type: (el as any).type || el.tagName
        }))
        return {
          index: idx,
          action: f.getAttribute('action'),
          method: f.getAttribute('method'),
          inputs
        }
      })
    })

    console.log('Formulários na página base:', JSON.stringify(formsInfo, null, 2))

    // Se houver formulário de ficha geral, tentamos preencher o apenado de teste e enviar
    if (formsInfo.length > 0) {
      console.log('Preenchendo formulário...')
      // No SIPE, Chosen-selects são chatos de usar diretamente no Playwright.
      // Vamos tentar simular o POST fazendo o fetch ou preenchendo o formulário por JS e submetendo
      const postHtml = await page.evaluate(async (id: number) => {
        const form = document.querySelector('form')
        if (!form) return 'Formulário não encontrado'
        
        // Criar ou preencher o input para o apenado
        // Tenta achar o select/input de apenado no formulário
        let apenadoInput = form.querySelector('[name="apenado"]') as any
        if (!apenadoInput) {
          apenadoInput = form.querySelector('[name="apenado_id"]') as any
        }
        if (!apenadoInput) {
          // Cria dinamicamente se não achar para ver se o backend aceita
          const input = document.createElement('input')
          input.type = 'hidden'
          input.name = 'apenado'
          input.value = String(id)
          form.appendChild(input)
        } else {
          apenadoInput.value = String(id)
        }

        // Submete o formulário
        form.submit()
        return 'Submetido'
      }, sipeId)

      console.log('Ação de submissão:', postHtml)
      
      // Aguarda redirecionamento ou carregamento após submit (geralmente abre em nova aba ou na mesma)
      await page.waitForTimeout(5000)
      
      const newUrl = page.url()
      const newHtml = await page.content()
      console.log(`URL após submit: ${newUrl}`)
      console.log(`Tamanho HTML após submit: ${newHtml.length}`)
      fs.writeFileSync('scratch/ficha-geral-submitted.html', newHtml)

      if (newHtml.includes('Whoops')) {
        const err = await page.evaluate(() => document.body.innerText.substring(0, 1000))
        console.log('Erro Laravel após submit:', err)
      } else {
        const containsMov = newHtml.toLowerCase().includes('movimentac') || newHtml.toLowerCase().includes('histórico')
        console.log(`Contém textos de movimentações/histórico? ${containsMov}`)

        const tablesData = await page.evaluate(() => {
          return Array.from(document.querySelectorAll('table')).map((table, idx) => {
            const headers = Array.from(table.querySelectorAll('thead th, thead td, tr th')).map(el => el.textContent?.trim() || '')
            const rows = Array.from(table.querySelectorAll('tbody tr, tr')).map(row => {
              return Array.from(row.querySelectorAll('td')).map(el => el.textContent?.trim() || '')
            }).filter(r => r.length > 0)
            
            return {
              index: idx,
              headers: headers.filter(Boolean).slice(0, 10),
              rowsCount: rows.length,
              sampleRows: rows.slice(0, 3)
            }
          })
        })
        console.log('Tabelas na Ficha Geral:', JSON.stringify(tablesData, null, 2))
      }
    }

  } catch (err) {
    console.error('Erro:', err)
  } finally {
    await browser.close()
  }
}

checkFichaGeral()
