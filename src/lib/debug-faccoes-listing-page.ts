/**
 * Debug: Analisa a página /apenados/index em detalhes
 * para encontrar onde as facções estão sendo exibidas
 */

import { chromium } from 'playwright'
import * as fs from 'fs'
import * as path from 'path'

const SIPE_URL = 'https://sipe.sejus.ro.gov.br'
const DEBUG_DIR = path.join(process.cwd(), '.debug-sipe')

async function debugFaccoesListingPage() {
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

    // Salvar HTML completo
    const html = await page.content()
    const htmlPath = path.join(DEBUG_DIR, 'apenados-index-full.html')
    fs.writeFileSync(htmlPath, html)
    console.log(`📄 HTML salvo em: ${htmlPath}\n`)

    // ═══════════════════════════════════════════════════════════════════
    // ANÁLISE DETALHADA
    // ═══════════════════════════════════════════════════════════════════

    const analysis = await page.evaluate(() => {
      const result = {
        url: window.location.href,
        title: document.title,
        tablesCount: document.querySelectorAll('table').length,
        divsCount: document.querySelectorAll('div').length,
        allTextContent: document.body.innerText.substring(0, 5000),
        tableHeaders: [] as string[],
        tableRows: [] as string[][],
        faccaoMentions: [] as string[],
        scriptContent: [] as string[]
      }

      // Extrair headers de tabelas
      const tables = document.querySelectorAll('table')
      for (const table of tables) {
        const headers = Array.from(table.querySelectorAll('thead th, thead td'))
          .map(h => h.textContent?.trim() || '')
          .filter(h => h)
        result.tableHeaders.push(...headers)

        // Extrair primeiras 3 linhas
        const rows = Array.from(table.querySelectorAll('tbody tr')).slice(0, 3)
        for (const row of rows) {
          const cells = Array.from(row.querySelectorAll('td, th'))
            .map(c => c.textContent?.trim().substring(0, 100) || '')
          result.tableRows.push(cells)
        }
      }

      // Procurar por "faccao", "faction", "TCP", "PCC", "COMANDO VERMELHO"
      const bodyText = document.body.innerText.toLowerCase()
      if (bodyText.includes('faccao') || bodyText.includes('faction')) {
        result.faccaoMentions.push('Encontrado "faccao" ou "faction" no body text')
      }
      if (bodyText.includes('tcp')) {
        result.faccaoMentions.push('Encontrado "tcp" no body text')
      }
      if (bodyText.includes('pcc')) {
        result.faccaoMentions.push('Encontrado "pcc" no body text')
      }
      if (bodyText.includes('comando vermelho')) {
        result.faccaoMentions.push('Encontrado "comando vermelho" no body text')
      }
      if (bodyText.includes('bonde dos 13')) {
        result.faccaoMentions.push('Encontrado "bonde dos 13" no body text')
      }

      // Extrair conteúdo de scripts (dados podem estar lá)
      const scripts = document.querySelectorAll('script')
      for (const script of scripts) {
        if (script.textContent) {
          if (script.textContent.toLowerCase().includes('faccao')) {
            result.scriptContent.push(script.textContent.substring(0, 500))
          }
        }
      }

      return result
    })

    console.log('═══════════════════════════════════════════════════════════════════')
    console.log('📊 ANÁLISE DE /apenados/index')
    console.log('═══════════════════════════════════════════════════════════════════\n')

    console.log(`URL: ${analysis.url}`)
    console.log(`Título: ${analysis.title}`)
    console.log(`Tabelas: ${analysis.tablesCount}`)
    console.log(`Divs: ${analysis.divsCount}\n`)

    console.log('📋 Headers de Tabelas:')
    if (analysis.tableHeaders.length > 0) {
      console.log(`  ${analysis.tableHeaders.join(' | ')}`)
    } else {
      console.log('  (nenhum header encontrado)')
    }

    console.log('\n📝 Primeiras 3 linhas da tabela:')
    for (let i = 0; i < analysis.tableRows.length; i++) {
      console.log(`  [${i + 1}]: ${analysis.tableRows[i].slice(0, 3).join(' | ')}`)
    }

    console.log('\n🔍 Menções a facção:')
    if (analysis.faccaoMentions.length > 0) {
      for (const mention of analysis.faccaoMentions) {
        console.log(`  ✓ ${mention}`)
      }
    } else {
      console.log('  ✗ Nenhuma menção a facção, TCP, PCC, COMANDO VERMELHO, ou BONDE DOS 13')
    }

    console.log('\n⚙️  Scripts com "faccao":')
    if (analysis.scriptContent.length > 0) {
      for (const content of analysis.scriptContent) {
        console.log(`  ${content.substring(0, 200)}...`)
      }
    } else {
      console.log('  ✗ Nenhum script com "faccao"')
    }

    // ═══════════════════════════════════════════════════════════════════
    // PROCURAR POR ATRIBUTOS DATA OU CLASSES COM "FAC"
    // ═══════════════════════════════════════════════════════════════════

    console.log('\n═══════════════════════════════════════════════════════════════════')
    console.log('🔎 PROCURANDO ATRIBUTOS COM "FAC"')
    console.log('═══════════════════════════════════════════════════════════════════\n')

    const elementsWithFac = await page.evaluate(() => {
      const results: any[] = []

      const allElements = document.querySelectorAll('*')
      for (const elem of allElements) {
        const attrs = elem.attributes
        for (const attr of attrs) {
          if (attr.name.toLowerCase().includes('fac') || attr.value.toLowerCase().includes('fac')) {
            results.push({
              tag: elem.tagName,
              attr: attr.name,
              value: attr.value.substring(0, 100),
              textContent: elem.textContent?.substring(0, 100)
            })
          }
        }
      }

      return results.slice(0, 20)
    })

    if (elementsWithFac.length > 0) {
      console.log('✓ Elementos com atributos "fac":')
      for (const elem of elementsWithFac) {
        console.log(`  <${elem.tag} ${elem.attr}="${elem.value}">`)
        if (elem.textContent) {
          console.log(`    → ${elem.textContent}`)
        }
      }
    } else {
      console.log('✗ Nenhum elemento com atributo "fac"')
    }

    // Salvar análise
    const analysisPath = path.join(DEBUG_DIR, 'apenados-index-analysis.json')
    fs.writeFileSync(analysisPath, JSON.stringify(analysis, null, 2))
    console.log(`\n💾 Análise salva em: ${analysisPath}`)

  } catch (err) {
    console.error('\n❌ ERRO:', err)
  } finally {
    await browser.close()
  }
}

debugFaccoesListingPage().catch(console.error)
