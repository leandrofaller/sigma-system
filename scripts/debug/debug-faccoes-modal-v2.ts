/**
 * Debug: Abre modal, marca checkbox FACÇÃO via JavaScript
 */

import { chromium } from 'playwright'
import * as fs from 'fs'
import * as path from 'path'

const SIPE_URL = 'https://sipe.sejus.ro.gov.br'
const DEBUG_DIR = path.join(process.cwd(), '.debug-sipe')

async function debugFaccoesModal() {
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext()
  const page = await context.newPage()

  try {
    if (!fs.existsSync(DEBUG_DIR)) {
      fs.mkdirSync(DEBUG_DIR, { recursive: true })
    }

    console.log('\n📍 Fazendo login...')
    await page.goto(`${SIPE_URL}/`, { waitUntil: 'networkidle', timeout: 30_000 })

    const user = process.env.SIPE_USER || 'usuario'
    const pwd = process.env.SIPE_PASSWORD || 'senha'

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
        try {
          await selectDropdown.selectOption({ label: 'Master' })
        } catch {
          const options = await selectDropdown.evaluate((select: HTMLSelectElement) => {
            return Array.from(select.options).map(opt => ({
              value: opt.value,
              text: opt.textContent?.trim()
            }))
          })
          const masterOpt = options.find(o => o.text?.includes('Master'))
          if (masterOpt) {
            await selectDropdown.selectOption(masterOpt.value)
          }
        }
      }
      const entrarBtn = page.locator('button:has-text("ENTRAR")')
      await entrarBtn.click()
      await page.waitForTimeout(2000)
    }

    if (page.url().includes('/selectRole')) {
      console.log('📍 Selecionando role...')
      const selectRole = page.locator('select').first()
      if (await selectRole.isVisible({ timeout: 5_000 }).catch(() => false)) {
        try {
          await selectRole.selectOption({ label: 'Master' })
        } catch {
          const options = await selectRole.evaluate((select: HTMLSelectElement) => {
            return Array.from(select.options).map(opt => ({
              value: opt.value,
              text: opt.textContent?.trim()
            }))
          })
          const masterOpt = options.find(o => o.text?.includes('Master'))
          if (masterOpt) {
            await selectRole.selectOption(masterOpt.value)
          }
        }
      }
      const entrarBtn = page.locator('button:has-text("ENTRAR")')
      await entrarBtn.click()
      await page.waitForTimeout(2000)
    }

    console.log('✅ Login completo\n')
    console.log('📍 Acessando /apenados/index...')
    await page.goto(`${SIPE_URL}/apenados/index`, {
      waitUntil: 'networkidle',
      timeout: 20_000
    })
    console.log('✅ Página carregada\n')

    console.log('📍 Clicando botão "Ficha Completa"...')
    const primeiroFichaBtn = page.locator('#btnFicha').first()
    await primeiroFichaBtn.click()
    await page.waitForTimeout(1000)

    const modalAberto = await page.locator('#myModalFicha.in').isVisible({ timeout: 5_000 }).catch(() => false)
    console.log(`  Modal aberto: ${modalAberto ? '✓' : '✗'}\n`)

    console.log('📍 Marcando checkbox FACÇÃO via JavaScript...')
    const result = await page.evaluate(() => {
      const checkbox = document.querySelector('#myModalFicha input[name="listar[]"][value="faccao"]') as HTMLInputElement
      if (!checkbox) {
        return { sucesso: false, erro: 'Checkbox não encontrado' }
      }

      const wasChecked = checkbox.checked
      checkbox.checked = true
      checkbox.dispatchEvent(new Event('change', { bubbles: true }))

      return {
        sucesso: true,
        wasChecked,
        agora: checkbox.checked
      }
    })

    console.log(`  Resultado: ${result.sucesso ? '✓' : '✗'}`)
    if (result.sucesso) {
      console.log(`  Status agora: ${result.agora}\n`)
    }

    console.log('📍 Fechando modal...')
    const closeBtn = page.locator('#myModalFicha button.close')
    if (await closeBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await closeBtn.click()
    } else {
      await page.keyboard.press('Escape')
    }
    await page.waitForTimeout(3000)

    console.log('\n═══════════════════════════════════════════════════════════════════')
    console.log('📊 EXTRAINDO DADOS DA TABELA')
    console.log('═══════════════════════════════════════════════════════════════════\n')

    const tabelaData = await page.evaluate(() => {
      const headers = [] as string[]
      let faccaoIndex = -1

      const headerCells = document.querySelectorAll('table thead th, table thead td')
      for (let i = 0; i < headerCells.length; i++) {
        const text = headerCells[i].textContent?.trim() || ''
        headers.push(text)
        if (text.toUpperCase().includes('FACÇÃO')) {
          faccaoIndex = i
        }
      }

      const rowElements = document.querySelectorAll('table tbody tr')
      const rows = []

      for (const row of rowElements) {
        const cells = row.querySelectorAll('td, th')
        const rowData: any = {}
        for (let i = 0; i < cells.length; i++) {
          rowData[headers[i] || `col_${i}`] = cells[i]?.textContent?.trim() || ''
        }
        rows.push(rowData)
      }

      return { headers, faccaoIndex, totalRows: rowElements.length, rows }
    })

    console.log(`Total: ${tabelaData.totalRows}`)
    console.log(`FACÇÃO encontrada: ${tabelaData.faccaoIndex >= 0 ? `SIM [${tabelaData.faccaoIndex}]` : 'NÃO'}\n`)

    if (tabelaData.faccaoIndex >= 0) {
      const faccaoHeader = tabelaData.headers[tabelaData.faccaoIndex]
      console.log(`📋 Primeiros 10 apenados:\n`)
      for (let i = 0; i < Math.min(10, tabelaData.rows.length); i++) {
        const row = tabelaData.rows[i]
        const nome = row[tabelaData.headers.find(h => h.includes('NOME')) || 'NOME DO APENADO']?.substring(0, 30) || '?'
        const faccao = row[faccaoHeader] || '(vazio)'
        console.log(`  ${i + 1}. ${nome}: ${faccao}`)
      }
    } else {
      console.log('❌ FACÇÃO não foi encontrada na tabela')
    }

    const savePath = path.join(DEBUG_DIR, 'faccoes-modal-v2-result.json')
    fs.writeFileSync(savePath, JSON.stringify({
      checkboxMarcado: result.sucesso && result.agora,
      faccaoEncontrada: tabelaData.faccaoIndex >= 0,
      total: tabelaData.totalRows,
      headers: tabelaData.headers
    }, null, 2))

    console.log(`\n💾 Resultado: ${savePath}`)

  } catch (err: any) {
    console.error('\n❌ ERRO:', err.message)
  } finally {
    await browser.close()
  }
}

debugFaccoesModal().catch(console.error)
