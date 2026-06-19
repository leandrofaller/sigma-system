/**
 * Debug: Marca o checkbox "FACÇÃO" na página /apenados/index
 * e extrai os dados da coluna facção da tabela
 */

import { chromium } from 'playwright'
import * as fs from 'fs'
import * as path from 'path'

const SIPE_URL = 'https://sipe.sejus.ro.gov.br'
const DEBUG_DIR = path.join(process.cwd(), '.debug-sipe')

async function debugFaccoesWithCheckbox() {
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
        const options = await selectDropdown.evaluate((select: HTMLSelectElement) => {
          return Array.from(select.options).map(opt => ({
            value: opt.value,
            text: opt.textContent?.trim()
          }))
        })
        try {
          await selectDropdown.selectOption({ label: 'Master' })
        } catch {
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
    // MARCAR O CHECKBOX DA FACÇÃO
    // ═══════════════════════════════════════════════════════════════════

    console.log('📍 Procurando checkbox FACÇÃO...')

    // Procurar pelo checkbox com value="faccao"
    const faccaoCheckbox = page.locator('input[name="listar[]"][value="faccao"]')
    const isChecked = await faccaoCheckbox.isChecked()

    console.log(`  Status atual: ${isChecked ? '✓ MARCADO' : '✗ NÃO MARCADO'}`)

    if (!isChecked) {
      console.log('  Clicando no checkbox...')
      await faccaoCheckbox.click()
      await page.waitForTimeout(1500) // Esperar a tabela recarregar
      console.log('  ✅ Checkbox marcado\n')
    }

    // ═══════════════════════════════════════════════════════════════════
    // EXTRAIR DADOS DA TABELA COM COLUNA FACÇÃO
    // ═══════════════════════════════════════════════════════════════════

    console.log('═══════════════════════════════════════════════════════════════════')
    console.log('📊 EXTRAINDO DADOS COM COLUNA FACÇÃO')
    console.log('═══════════════════════════════════════════════════════════════════\n')

    const tabelaData = await page.evaluate(() => {
      const result = {
        headers: [] as string[],
        rows: [] as any[],
        faccaoColumnFound: false,
        faccaoColumnIndex: -1
      }

      // Extrair headers
      const headerCells = document.querySelectorAll('table thead th, table thead td')
      for (let i = 0; i < headerCells.length; i++) {
        const text = headerCells[i].textContent?.trim() || ''
        result.headers.push(text)

        // Procurar pela coluna FACÇÃO
        if (text.toUpperCase().includes('FACÇÃO') || text.toUpperCase().includes('FACTION')) {
          result.faccaoColumnFound = true
          result.faccaoColumnIndex = i
        }
      }

      console.log(`Header: ${result.headers.join(' | ')}`)
      console.log(`Facção encontrada no índice: ${result.faccaoColumnIndex}`)

      // Extrair linhas
      const rowElements = document.querySelectorAll('table tbody tr')
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

    console.log(`\n✓ Headers encontrados: ${tabelaData.headers.length}`)
    console.log(`✓ Linhas extraídas: ${tabelaData.rows.length}`)
    console.log(`✓ Coluna FACÇÃO encontrada: ${tabelaData.faccaoColumnFound ? 'SIM' : 'NÃO'}\n`)

    if (tabelaData.faccaoColumnFound) {
      console.log('📋 Coluna FACÇÃO localization:')
      console.log(`  Índice: ${tabelaData.faccaoColumnIndex}`)
      console.log(`  Header: ${tabelaData.headers[tabelaData.faccaoColumnIndex]}\n`)

      console.log('📝 Primeiros 10 apenados com sua facção:')
      for (let i = 0; i < Math.min(10, tabelaData.rows.length); i++) {
        const row = tabelaData.rows[i]
        const nomeCol = tabelaData.headers.find(h => h.includes('NOME'))
        const faccaoCol = tabelaData.headers[tabelaData.faccaoColumnIndex]

        const nome = row[nomeCol || 'NOME DO APENADO'] || '(sem nome)'
        const faccao = row[faccaoCol] || '(sem facção)'

        console.log(`  [${i + 1}] ${nome.substring(0, 50)}: ${faccao}`)
      }
    } else {
      console.log('❌ Coluna FACÇÃO NÃO encontrada na tabela!')
      console.log('\n📋 Headers disponíveis:')
      for (let i = 0; i < tabelaData.headers.length; i++) {
        console.log(`  [${i}] ${tabelaData.headers[i]}`)
      }
    }

    // ═══════════════════════════════════════════════════════════════════
    // CONTAR FACÇÕES E GERAR RELATÓRIO
    // ═══════════════════════════════════════════════════════════════════

    const faccaoStats = await page.evaluate((columnIndex: number) => {
      const stats = {
        totalApenados: 0,
        comFaccao: 0,
        semFaccao: 0,
        faccoes: {} as { [key: string]: number }
      }

      const rows = document.querySelectorAll('table tbody tr')
      stats.totalApenados = rows.length

      for (const row of rows) {
        const cells = row.querySelectorAll('td, th')
        const faccaoCell = cells[columnIndex]
        const faccaoText = faccaoCell?.textContent?.trim() || ''

        if (!faccaoText || faccaoText === '') {
          stats.semFaccao++
        } else {
          stats.comFaccao++
          stats.faccoes[faccaoText] = (stats.faccoes[faccaoText] || 0) + 1
        }
      }

      return stats
    }, tabelaData.faccaoColumnIndex)

    console.log('\n═══════════════════════════════════════════════════════════════════')
    console.log('📊 RESUMO DE FACÇÕES')
    console.log('═══════════════════════════════════════════════════════════════════\n')

    console.log(`Total de apenados: ${faccaoStats.totalApenados}`)
    console.log(`Com facção: ${faccaoStats.comFaccao}`)
    console.log(`Sem facção: ${faccaoStats.semFaccao}\n`)

    if (faccaoStats.comFaccao > 0) {
      console.log('📋 Distribuição de facções:')
      const sorted = Object.entries(faccaoStats.faccoes)
        .sort((a, b) => b[1] - a[1])

      for (const [faccao, count] of sorted) {
        console.log(`  ✓ ${faccao}: ${count}`)
      }
    }

    // Salvar relatório
    const relatorio = {
      timestamp: new Date().toISOString(),
      checkboxMarcado: !await faccaoCheckbox.isChecked().catch(() => false),
      faccaoColumnFound: tabelaData.faccaoColumnFound,
      headers: tabelaData.headers,
      stats: faccaoStats,
      apenados: tabelaData.rows.slice(0, 50) // Primeiros 50 para não ficar gigante
    }

    const relatorioPath = path.join(DEBUG_DIR, 'faccoes-com-checkbox.json')
    fs.writeFileSync(relatorioPath, JSON.stringify(relatorio, null, 2))
    console.log(`\n💾 Relatório salvo em: ${relatorioPath}`)

  } catch (err) {
    console.error('\n❌ ERRO:', err)
  } finally {
    await browser.close()
  }
}

debugFaccoesWithCheckbox().catch(console.error)
