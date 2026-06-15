import { chromium } from 'playwright'
import * as dotenv from 'dotenv'
import * as path from 'path'
import * as fs from 'fs'

// Configura dotenv da raiz do workspace
dotenv.config()

const SIPE_URL = 'https://sipe.sejus.ro.gov.br'
const SIPE_CPF = process.env.SIPE_CPF ?? ''
const SIPE_SENHA = process.env.SIPE_SENHA ?? ''

async function main() {
  console.log('CPF carregado:', SIPE_CPF ? 'SIM' : 'NÃO')
  console.log('Senha carregada:', SIPE_SENHA ? 'SIM' : 'NÃO')

  if (!SIPE_CPF || !SIPE_SENHA) {
    console.error('Credenciais do SIPE não configuradas no arquivo .env')
    return
  }

  console.log('Iniciando Chromium...')
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  })
  const page = await context.newPage()

  try {
    console.log('Acessando página de login do SIPE...')
    await page.goto(`${SIPE_URL}/`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
    await page.waitForSelector('input[type="password"]', { timeout: 30_000 })

    const cpfInput = (await page.$('input[placeholder*="CPF"]')) ?? (await page.$('input[name*="cpf"], input[name*="login"], input[type="text"]'))
    if (!cpfInput) {
      throw new Error('Campo CPF não encontrado.')
    }
    await cpfInput.fill(SIPE_CPF)
    await page.fill('input[type="password"]', SIPE_SENHA)
    
    console.log('Enviando formulário de login...')
    await page.click('button[type="submit"], input[type="submit"]')
    await page.waitForTimeout(3000)

    // Se tiver tela de selecionar perfil
    if (page.url().includes('/selectRole') || await page.locator('text="Selecione o Perfil Desejado"').isVisible({ timeout: 3000 }).catch(() => false)) {
      console.log('Selecionando perfil...')
      const selectDropdown = page.locator('select').first()
      if (await selectDropdown.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await selectDropdown.selectOption({ label: 'Master' })
      }
      await page.click('button:has-text("ENTRAR")')
      await page.waitForTimeout(3000)
    }

    console.log('Login efetuado com sucesso. URL atual:', page.url())

    console.log('Navegando para /apenados/index...')
    await page.goto(`${SIPE_URL}/apenados/index`, { waitUntil: 'networkidle', timeout: 45_000 })
    console.log('Página carregada. URL:', page.url())

    console.log('Inspecionando o modal #myModalFicha na página...')
    
    // Vamos extrair a lista de todos os inputs name="listar[]" contidos em #myModalFicha
    const checkboxesInfo = await page.evaluate(() => {
      const modal = document.querySelector('#myModalFicha')
      if (!modal) {
        return { error: 'Modal #myModalFicha não encontrado no DOM.' }
      }

      const inputs = modal.querySelectorAll('input[name="listar[]"]')
      const list: { value: string; label: string; id: string; checked: boolean }[] = []

      inputs.forEach((input: any) => {
        // Acha o label associado. Geralmente pode ser um label vizinho, pai ou referenciando pelo id
        let labelText = ''
        if (input.id) {
          const label = modal.querySelector(`label[for="${input.id}"]`)
          if (label) {
            labelText = label.textContent?.trim() || ''
          }
        }
        if (!labelText) {
          // Tenta ver se está dentro de um label ou tem texto próximo
          const parent = input.parentElement
          if (parent) {
            labelText = parent.textContent?.trim() || ''
          }
        }

        list.push({
          value: input.value,
          label: labelText.replace(/\s+/g, ' '),
          id: input.id || '',
          checked: input.checked
        })
      })

      return { success: true, list }
    })

    console.log('--- CHECKBOXES ENCONTRADOS ---')
    console.log(JSON.stringify(checkboxesInfo, null, 2))

  } catch (err: any) {
    console.error('Erro na execução do script:', err.message || err)
  } finally {
    await browser.close()
    console.log('Browser finalizado.')
  }
}

main()
