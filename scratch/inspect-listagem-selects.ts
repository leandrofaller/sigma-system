import { chromium } from 'playwright'
import fs from 'fs'
import path from 'path'

// Função para carregar o .env
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

async function inspectListagem() {
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

    // Seleciona perfil e unidade
    await page.evaluate((perfil) => {
      const selects = document.querySelectorAll('select')
      const selectPerfil = selects[0] as HTMLSelectElement
      if (selectPerfil) {
        selectPerfil.value = perfil
        selectPerfil.dispatchEvent(new Event('change', { bubbles: true }))
      }
    }, SIPE_PERFIL)

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

    console.log('Login efetuado com sucesso. Navegando para a listagem de apenados...')
    await page.goto(`${SIPE_URL}/apenados/index`, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('tbody', { timeout: 15000 }).catch(() => {})

    console.log('Inspecionando os elementos select na listagem de apenados...')
    const selectsIndex = await extrairSelectsDaPagina(page)

    console.log('Navegando para o relatório de Ficha Geral...')
    await page.goto(`${SIPE_URL}/relatorios/fichaGeral`, { waitUntil: 'domcontentloaded', timeout: 30000 })
    await page.waitForTimeout(2000) // Aguarda renderização inicial dos selects/Chosen

    console.log('Inspecionando os elementos select no relatório Ficha Geral...')
    const selectsFichaGeral = await extrairSelectsDaPagina(page)

    const resultados = {
      index: selectsIndex,
      fichaGeral: selectsFichaGeral
    }

    console.log(`\nInspeção concluída!`)
    console.log(`- Selects em /apenados/index: ${selectsIndex.length}`)
    console.log(`- Selects em /relatorios/fichaGeral: ${selectsFichaGeral.length}`)
    
    // Imprime resumo de Ficha Geral
    console.log(`\n--- FILTROS DA FICHA GERAL (/relatorios/fichaGeral) ---`)
    for (const sel of selectsFichaGeral) {
      console.log(`Select #${sel.index} - ID: "${sel.id}", Name: "${sel.name}", Label: "${sel.label}"`)
      console.log(`   Total Opções: ${sel.optionsCount}`)
      console.log(`   Exemplos de opções (primeiras 8):`)
      console.log(sel.options.slice(0, 8).map(o => `     - [${o.value}]: "${o.text}"`).join('\n'))
    }

    const outputPath = path.join(process.cwd(), 'scratch', 'selects-listagem.json')
    fs.mkdirSync(path.dirname(outputPath), { recursive: true })
    fs.writeFileSync(outputPath, JSON.stringify(resultados, null, 2), 'utf8')
    console.log(`\nRelatório completo de todos os selects salvo em: ${outputPath}`)

  } catch (error) {
    console.error('Erro ao inspecionar listagem:', error)
  } finally {
    await browser.close()
  }
}

async function extrairSelectsDaPagina(page: any) {
  return await page.evaluate(() => {
    const selectElements = document.querySelectorAll('select')
    return Array.from(selectElements).map((s, idx) => {
      let labelText = ''
      const id = s.id
      if (id) {
        const label = document.querySelector(`label[for="${id}"]`)
        if (label) labelText = label.textContent?.trim() ?? ''
      }
      
      if (!labelText) {
        const parentGroup = s.closest('.form-group, .col-md-3, .col-md-4, .col-sm-4, .control-group')
        const label = parentGroup?.querySelector('label')
        if (label) labelText = label.textContent?.trim() ?? ''
      }

      return {
        index: idx,
        id: s.id || null,
        name: s.name || null,
        label: labelText || null,
        optionsCount: s.options.length,
        options: Array.from(s.options).map(o => ({
          value: o.value,
          text: o.text?.trim() ?? ''
        }))
      }
    })
  })
}

inspectListagem()
