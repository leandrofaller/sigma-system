/**
 * Debug: Abre modal, marca checkbox FACÇÃO e extrai dados
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

    // Selecionar perfil se necessário
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

    // ═══════════════════════════════════════════════════════════════════
    // ACESSAR /apenados/index
    // ═══════════════════════════════════════════════════════════════════

    console.log('📍 Acessando /apenados/index...')
    await page.goto(`${SIPE_URL}/apenados/index`, {
      waitUntil: 'networkidle',
      timeout: 20_000
    })
    console.log('✅ Página carregada\n')

    // ═══════════════════════════════════════════════════════════════════
    // ABRIR MODAL DE SELEÇÃO DE COLUNAS
    // ═══════════════════════════════════════════════════════════════════

    console.log('📍 Procurando primeira linha com botão "Ficha Completa"...')

    // O botão está em cada linha da tabela, vamos clicar no primeiro
    const primeiroFichaBtn = page.locator('#btnFicha').first()
    const exists = await primeiroFichaBtn.isVisible({ timeout: 3_000 }).catch(() => false)

    if (!exists) {
      console.log('❌ Botão "Ficha Completa" não encontrado')
      return
    }

    console.log('  Clicando em "Ficha Completa"...')
    await primeiroFichaBtn.click()
    await page.waitForTimeout(1000)

    // Verificar se a modal foi aberta
    const modalAberto = await page.locator('#myModalFicha.show, #myModalFicha[style*="display: block"]').isVisible({ timeout: 5_000 }).catch(() => false)
    console.log(`  Modal aberto: ${modalAberto ? '✓ SIM' : '✗ NÃO'}\n`)

    if (modalAberto) {
      // ═══════════════════════════════════════════════════════════════════
      // MARCAR O CHECKBOX DA FACÇÃO NA MODAL
      // ═══════════════════════════════════════════════════════════════════

      console.log('📍 Marcando checkbox FACÇÃO...')

      const faccaoCheckbox = page.locator('#myModalFicha input[name="listar[]"][value="faccao"]')
      const isChecked = await faccaoCheckbox.isChecked()

      console.log(`  Status atual: ${isChecked ? '✓ MARCADO' : '✗ NÃO MARCADO'}`)

      if (!isChecked) {
        console.log('  Clicando no checkbox...')
        await faccaoCheckbox.click()
        await page.waitForTimeout(500)
        const agora = await faccaoCheckbox.isChecked()
        console.log(`  Status após clique: ${agora ? '✓ MARCADO' : '✗ NÃO MARCADO'}\n`)
      }

      // Fechar modal (procurar por botão close ou simplesmente clicar em data-dismiss)
      console.log('📍 Fechando modal...')
      const closeBtn = page.locator('#myModalFicha button.close')
      if (await closeBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await closeBtn.click()
      } else {
        // Tentar clicar fora da modal para fechar
        await page.keyboard.press('Escape')
      }
      await page.waitForTimeout(1000)
    }

    // ═══════════════════════════════════════════════════════════════════
    // EXTRAIR DADOS DA TABELA
    // ═══════════════════════════════════════════════════════════════════

    console.log('═══════════════════════════════════════════════════════════════════')
    console.log('📊 EXTRAINDO DADOS DA TABELA')
    console.log('═══════════════════════════════════════════════════════════════════\n')

    const tabelaData = await page.evaluate(() => {
      const result = {
        headers: [] as string[],
        rows: [] as any[],
        totalRows: 0
      }

      // Extrair headers
      const headerCells = document.querySelectorAll('table thead th, table thead td')
      for (let i = 0; i < headerCells.length; i++) {
        const text = headerCells[i].textContent?.trim() || ''
        result.headers.push(text)
      }

      // Extrair linhas
      const rowElements = document.querySelectorAll('table tbody tr')
      result.totalRows = rowElements.length

      for (const row of rowElements) {
        const cells = row.querySelectorAll('td, th')
        const rowData: any = {}

        for (let i = 0; i < cells.length; i++) {
          const header = result.headers[i] || `col_${i}`
          const value = cells[i]?.textContent?.trim() || ''
          rowData[header] = value
        }

        result.rows.push(rowData)
      }

      return result
    })

    console.log(`✓ Headers: ${tabelaData.headers.length}`)
    console.log(`✓ Apenados: ${tabelaData.totalRows}\n`)

    // Procurar pelo header FACÇÃO
    const faccaoHeaderIndex = tabelaData.headers.findIndex(h => h.toUpperCase().includes('FACÇÃO') || h.toUpperCase().includes('FACTION'))

    console.log('📋 Headers da tabela:')
    for (let i = 0; i < tabelaData.headers.length; i++) {
      const marker = i === faccaoHeaderIndex ? ' 👈 FACÇÃO' : ''
      console.log(`  [${i}] ${tabelaData.headers[i]}${marker}`)
    }

    if (faccaoHeaderIndex === -1) {
      console.log('\n❌ COLUNA FACÇÃO NÃO ENCONTRADA NA TABELA')
      console.log('   Isso pode significar que:')
      console.log('   1. O checkbox não foi marcado corretamente')
      console.log('   2. A tabela não foi recarregada após marcar o checkbox')
      console.log('   3. A coluna facção está vazia/sem dados\n')
    } else {
      console.log(`\n✅ COLUNA FACÇÃO ENCONTRADA (índice ${faccaoHeaderIndex})\n`)

      console.log('📝 Primeiros 10 apenados com facção:')
      for (let i = 0; i < Math.min(10, tabelaData.rows.length); i++) {
        const row = tabelaData.rows[i]
        const nome = row[tabelaData.headers.find(h => h.includes('NOME')) || 'NOME DO APENADO'] || '(sem nome)'
        const faccao = row[tabelaData.headers[faccaoHeaderIndex]] || '(sem facção)'

        console.log(`  [${i + 1}] ${nome.substring(0, 40)}: ${faccao}`)
      }

      // Contar facções
      const faccaoCount: { [key: string]: number } = {}
      let comFaccao = 0

      for (const row of tabelaData.rows) {
        const faccao = row[tabelaData.headers[faccaoHeaderIndex]]?.trim()
        if (faccao && faccao !== '') {
          comFaccao++
          faccaoCount[faccao] = (faccaoCount[faccao] || 0) + 1
        }
      }

      console.log(`\n📊 Resumo:`)
      console.log(`  Total: ${tabelaData.totalRows}`)
      console.log(`  Com facção: ${comFaccao}`)
      console.log(`  Sem facção: ${tabelaData.totalRows - comFaccao}\n`)

      if (comFaccao > 0) {
        console.log('📋 Distribuição de facções:')
        const sorted = Object.entries(faccaoCount).sort((a, b) => b[1] - a[1])
        for (const [faccao, count] of sorted) {
          console.log(`  ✓ ${faccao}: ${count}`)
        }
      }
    }

    // Salvar análise completa
    const analise = {
      timestamp: new Date().toISOString(),
      totalApenados: tabelaData.totalRows,
      faccaoHeaderIndex,
      faccaoHeaderEncontrado: faccaoHeaderIndex !== -1,
      headers: tabelaData.headers,
      amostra: tabelaData.rows.slice(0, 20)
    }

    const analisePath = path.join(DEBUG_DIR, 'faccoes-modal-analysis.json')
    fs.writeFileSync(analisePath, JSON.stringify(analise, null, 2))
    console.log(`\n💾 Análise salva em: ${analisePath}`)

  } catch (err) {
    console.error('\n❌ ERRO:', err)
  } finally {
    await browser.close()
  }
}

debugFaccoesModal().catch(console.error)
