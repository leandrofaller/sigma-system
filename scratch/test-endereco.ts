import { chromium } from 'playwright'
import fs from 'fs'
import path from 'path'

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

const SIPE_URL = 'https://sipe.sejus.ro.gov.br'
const SIPE_CPF = process.env.SIPE_CPF ?? ''
const SIPE_SENHA = process.env.SIPE_SENHA ?? ''
const SIPE_PERFIL = process.env.SIPE_PERFIL ?? '2'
const SIPE_UNIDADE = '18' // Unidade de Nova Mamoré

async function login(page: any, unidadeId: string) {
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
    const selectPerfil = selects[0] as HTMLSelectElement
    if (selectPerfil) {
      selectPerfil.value = perfil
      selectPerfil.dispatchEvent(new Event('change', { bubbles: true }))
    }
  }, SIPE_PERFIL)

  try {
    await page.waitForFunction((unidade) => {
      const selects = document.querySelectorAll('select')
      const selectUnidade = selects[1] as HTMLSelectElement
      if (!selectUnidade) return false
      const options = Array.from(selectUnidade.options)
      return options.some(opt => opt.value === unidade)
    }, unidadeId, { timeout: 15_000 })
  } catch (err) {}

  await page.evaluate((unidade) => {
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

async function testEndereco() {
  console.log('🚀 Iniciando teste com a nova lógica de extração de endereço...')
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
    const url = `${SIPE_URL}/apenados/${sipeId}/enderecos`
    console.log(`Navegando para: ${url}`)
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 })

    await page.waitForTimeout(2000)

    const endereco = await page.evaluate(() => {
      const viewRow = document.querySelector('tr[id^="view_"]')
      if (!viewRow) {
        const logradouro = (document.querySelector('[name="rua_endereco"]') as HTMLInputElement | null)?.value?.trim() || null
        const numero = (document.querySelector('[name="numero_endereco"]') as HTMLInputElement | null)?.value?.trim() || null
        const complemento = (document.querySelector('[name="complemento_endereco"]') as HTMLInputElement | null)?.value?.trim() || null
        const bairro = (document.querySelector('[name="bairro_endereco"]') as HTMLInputElement | null)?.value?.trim() || null

        const estEl = document.querySelector('[name="estado_id"]') as HTMLSelectElement | null
        const uf = estEl?.options[estEl.selectedIndex]?.text?.trim() || null

        const cidEl = document.querySelector('[name="cidade_id"]') as HTMLSelectElement | null
        const cidade = cidEl?.options[cidEl.selectedIndex]?.text?.trim() || null

        const cep = (document.querySelector('[name="cep_endereco"]') as HTMLInputElement | null)?.value?.trim() ||
                    (document.querySelector('[name="cep"]') as HTMLInputElement | null)?.value?.trim() || null

        return {
          logradouro,
          numero,
          complemento,
          bairro,
          cidade,
          uf,
          cep,
          metodo: 'fallback'
        }
      }

      const cells = Array.from(viewRow.children)
      const idMatch = viewRow.id.match(/\d+/)
      const addrId = idMatch ? idMatch[0] : ''

      const logradouro = document.getElementById(`view_rua_endereco${addrId}`)?.textContent?.trim() || null
      const numero = document.getElementById(`view_numero_endereco${addrId}`)?.textContent?.trim() || null
      const complemento = document.getElementById(`view_complemento_endereco${addrId}`)?.textContent?.trim() || null
      const bairro = document.getElementById(`view_bairro_endereco${addrId}`)?.textContent?.trim() || null
      
      const cidadeEstado = cells[5]?.textContent?.trim() || '' // "Vilhena - RO"
      let cidade = null
      let uf = null

      if (cidadeEstado && cidadeEstado.includes('-')) {
        const parts = cidadeEstado.split('-')
        cidade = parts[0].trim()
        uf = parts[1].trim()
      } else if (cidadeEstado) {
        cidade = cidadeEstado
      }

      const cep = (document.querySelector('[name="cep_endereco"]') as HTMLInputElement | null)?.value?.trim() || null

      return {
        logradouro,
        numero,
        complemento,
        bairro,
        cidade,
        uf,
        cep,
        metodo: 'tabela_visual'
      }
    })

    console.log('\n--- Dados de endereço extraídos com a nova lógica ---')
    console.log(`  Método utilizado: ${endereco.metodo}`)
    console.log(`  Logradouro: ${endereco.logradouro}`)
    console.log(`  Número: ${endereco.numero}`)
    console.log(`  Complemento: ${endereco.complemento}`)
    console.log(`  Bairro: ${endereco.bairro}`)
    console.log(`  Cidade: ${endereco.cidade}`)
    console.log(`  UF: ${endereco.uf}`)
    console.log(`  CEP: ${endereco.cep}`)

  } catch (err: any) {
    console.error('❌ Erro no teste:', err)
  } finally {
    await browser.close()
    console.log('🏁 Teste finalizado.')
  }
}

testEndereco()
