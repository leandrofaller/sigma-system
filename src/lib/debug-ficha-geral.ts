/**
 * Script de debug: Inspecionar facções no relatório /relatorios/fichaGeral
 */

import { chromium } from 'playwright'
import * as fs from 'fs'
import * as path from 'path'

const SIPE_URL = 'https://sipe.sejus.ro.gov.br'
const DEBUG_DIR = path.join(process.cwd(), '.debug-sipe')

async function debugFichaGeral() {
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext()
  const page = await context.newPage()

  try {
    if (!fs.existsSync(DEBUG_DIR)) {
      fs.mkdirSync(DEBUG_DIR, { recursive: true })
    }

    console.log('\n📍 FASE 1: Fazendo login no SIPE...')
    await page.goto(`${SIPE_URL}/`, { waitUntil: 'networkidle', timeout: 30_000 })

    const user = process.env.SIPE_USER || 'usuario'
    const pwd = process.env.SIPE_PASSWORD || 'senha'

    console.log('📍 Preenchendo credenciais...')
    await page.waitForSelector('input[name="cpf"]', { timeout: 15_000 })
    await page.fill('input[name="cpf"]', user)

    await page.waitForSelector('input[type="password"]', { timeout: 5_000 })
    await page.fill('input[type="password"]', pwd)

    console.log('🖱️ Clicando em login...')
    await page.click('button[type="submit"]')
    await page.waitForTimeout(2000)

    // Detectar página de seleção de perfil/unidade
    const perfilPage = await page.locator('text="Selecione o Perfil Desejado"').isVisible({ timeout: 3_000 }).catch(() => false)

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

    // Detectar página /selectRole
    if (page.url().includes('/selectRole')) {
      console.log('📍 Selecionando role...')
      const selectRole = page.locator('select').first()
      if (await selectRole.isVisible({ timeout: 5_000 }).catch(() => false)) {
        const options = await selectRole.evaluate((select: HTMLSelectElement) => {
          return Array.from(select.options).map(opt => ({
            value: opt.value,
            text: opt.textContent?.trim()
          }))
        })

        try {
          await selectRole.selectOption({ label: 'Master' })
        } catch {
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

    // ═══════════════════════════════════════════════════════════════════
    // ACESSAR /relatorios/fichaGeral
    // ═══════════════════════════════════════════════════════════════════

    console.log('\n📍 Acessando /relatorios/fichaGeral...')
    await page.goto(`${SIPE_URL}/relatorios/fichaGeral`, {
      waitUntil: 'networkidle',
      timeout: 20_000
    })
    console.log('✅ Página carregada')

    // Salvar HTML
    const html = await page.content()
    const htmlPath = path.join(DEBUG_DIR, 'ficha-geral.html')
    fs.writeFileSync(htmlPath, html)
    console.log(`📄 HTML salvo em: ${htmlPath}`)

    await page.waitForTimeout(500)

    // ═══════════════════════════════════════════════════════════════════
    // ANALISAR PÁGINA
    // ═══════════════════════════════════════════════════════════════════

    console.log('\n📍 Analisando página...')

    const analysis = await page.evaluate(() => {
      return {
        url: window.location.href,
        title: document.title,

        // Procurar por selects
        selects: Array.from(document.querySelectorAll('select')).map((sel, idx) => ({
          index: idx,
          name: sel.name,
          id: sel.id,
          optionsCount: sel.options.length,
          options: Array.from(sel.options)
            .slice(0, 15)
            .map(o => o.textContent?.trim())
        })),

        // Procurar por inputs hidden
        hiddenInputs: Array.from(document.querySelectorAll('input[type="hidden"]')).map(inp => ({
          name: inp.name,
          value: inp.value.substring(0, 50)
        })).slice(0, 10),

        // Procurar por elementos que contenham "fac"
        textMatches: Array.from(document.querySelectorAll('label, th, td, div, span'))
          .map(el => el.textContent?.trim())
          .filter(text => text && (
            text.toLowerCase().includes('fac') ||
            text.toLowerCase().includes('sexo') ||
            text.toLowerCase().includes('gênero') ||
            text.toLowerCase().includes('relat')
          ))
          .slice(0, 30),

        // Procurar por tabelas
        tables: Array.from(document.querySelectorAll('table')).map((table, idx) => ({
          index: idx,
          rows: table.rows.length,
          cols: table.rows[0]?.cells.length || 0,
          headers: Array.from(table.querySelectorAll('th, thead td'))
            .map(th => th.textContent?.trim())
            .slice(0, 15)
        })),

        // Contar estruturas
        totalSelects: document.querySelectorAll('select').length,
        totalInputs: document.querySelectorAll('input').length,
        totalTables: document.querySelectorAll('table').length,
        totalButtons: document.querySelectorAll('button').length,
        bodyLength: document.body.innerText.length
      }
    })

    console.log('\n═══════════════════════════════════════════════════════════════════')
    console.log('📊 ANÁLISE DE /relatorios/fichaGeral')
    console.log('═══════════════════════════════════════════════════════════════════\n')

    console.log(`URL: ${analysis.url}`)
    console.log(`Title: ${analysis.title}`)
    console.log(`Body length: ${analysis.bodyLength} caracteres`)

    console.log(`\n📊 Estrutura da página:`)
    console.log(`  - Selects: ${analysis.totalSelects}`)
    console.log(`  - Inputs: ${analysis.totalInputs}`)
    console.log(`  - Tabelas: ${analysis.totalTables}`)
    console.log(`  - Buttons: ${analysis.totalButtons}`)

    if (analysis.selects.length > 0) {
      console.log(`\n📋 SELECTs encontrados:`)
      for (const sel of analysis.selects) {
        console.log(`  [${sel.index}] name="${sel.name}" id="${sel.id}" (${sel.optionsCount} opções)`)
        if (sel.options.length > 0) {
          console.log(`      Primeiras opções: ${sel.options.slice(0, 5).join(', ')}`)
        }
      }
    }

    if (analysis.tables.length > 0) {
      console.log(`\n📊 TABELAS encontradas:`)
      for (const tbl of analysis.tables) {
        console.log(`  [${tbl.index}] ${tbl.rows} linhas × ${tbl.cols} colunas`)
        console.log(`      Headers: ${tbl.headers.join(', ')}`)
      }
    }

    if (analysis.textMatches.length > 0) {
      console.log(`\n🏷️ Textos relevantes encontrados:`)
      for (const text of analysis.textMatches.slice(0, 15)) {
        console.log(`  - ${text.substring(0, 80)}`)
      }
    }

    // ═══════════════════════════════════════════════════════════════════
    // TESTE DE SELETORES
    // ═══════════════════════════════════════════════════════════════════

    console.log('\n═══════════════════════════════════════════════════════════════════')
    console.log('🧪 TESTE DE SELETORES')
    console.log('═══════════════════════════════════════════════════════════════════\n')

    const selectorTests = [
      'select[name*="faccao"]',
      'select[name*="faction"]',
      'input[name*="faccao"]',
      'select:first-of-type',
      'table td:contains("faccao")',
      'select'
    ]

    for (const selector of selectorTests) {
      try {
        const elements = await page.$$(selector)
        if (elements.length > 0) {
          console.log(`✓ ${selector}`)
          console.log(`  → ${elements.length} elemento(s) encontrado(s)`)

          if (elements[0].tagName === 'SELECT') {
            const info = await page.evaluate(el => {
              const opts = Array.from(el.querySelectorAll('option'))
                .slice(0, 5)
                .map(o => o.textContent?.trim())
              return { options: opts, name: (el as any).name }
            }, elements[0])
            console.log(`  → Name: ${info.name}`)
            console.log(`  → Primeiras opções: ${info.options.join(', ')}`)
          }
        }
      } catch (err) {
        // Continuar
      }
    }

    // Salvar análise
    const analysisPath = path.join(DEBUG_DIR, 'ficha-geral-analysis.json')
    fs.writeFileSync(analysisPath, JSON.stringify(analysis, null, 2))
    console.log(`\n💾 Análise completa salva em: ${analysisPath}`)

    console.log('\n✅ Debug concluído!')
    console.log('📄 Arquivos gerados:')
    console.log(`  - ${htmlPath}`)
    console.log(`  - ${analysisPath}`)

  } catch (err) {
    console.error('\n❌ ERRO:', err)
  } finally {
    await browser.close()
  }
}

debugFichaGeral().catch(console.error)
