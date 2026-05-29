/**
 * Script de debug: Inspecionar a página /apenados/{id}/editar para entender
 * a estrutura de facção de UM apenado específico
 */

import { chromium } from 'playwright'
import * as fs from 'fs'
import * as path from 'path'

const SIPE_URL = 'https://sipe.sejus.ro.gov.br'
const DEBUG_DIR = path.join(process.cwd(), '.debug-sipe')

// Usar o primeiro apenado da lista anterior (ID: 64475)
const TEST_APENADO_ID = '64475'

async function debugFaccoesSingle() {
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext()
  const page = await context.newPage()

  try {
    if (!fs.existsSync(DEBUG_DIR)) {
      fs.mkdirSync(DEBUG_DIR, { recursive: true })
    }

    console.log('\n📍 FASE 1: Fazendo login...')
    await page.goto(`${SIPE_URL}/`, { waitUntil: 'networkidle', timeout: 30_000 })

    const user = process.env.SIPE_USER || 'usuario'
    const pwd = process.env.SIPE_PASSWORD || 'senha'

    await page.waitForSelector('input[name="cpf"]', { timeout: 15_000 })
    await page.fill('input[name="cpf"]', user)

    await page.waitForSelector('input[type="password"]', { timeout: 5_000 })
    await page.fill('input[type="password"]', pwd)

    await page.click('button[type="submit"]')
    await page.waitForTimeout(2000)

    // Detectar página de seleção de perfil
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

    console.log('✅ Login completo\n')

    // ═══════════════════════════════════════════════════════════════════
    // ACESSAR PÁGINA DE EDIÇÃO DO APENADO
    // ═══════════════════════════════════════════════════════════════════

    console.log(`📍 Acessando /apenados/${TEST_APENADO_ID}/editar...`)
    await page.goto(`${SIPE_URL}/apenados/${TEST_APENADO_ID}/editar`, {
      waitUntil: 'domcontentloaded',
      timeout: 15_000
    })
    console.log('✅ Página carregada\n')

    // Salvar HTML completo
    const html = await page.content()
    const htmlPath = path.join(DEBUG_DIR, 'apenado-editar.html')
    fs.writeFileSync(htmlPath, html)
    console.log(`📄 HTML salvo em: ${htmlPath}`)

    // ═══════════════════════════════════════════════════════════════════
    // ANALISAR ESTRUTURA DE SELECTS
    // ═══════════════════════════════════════════════════════════════════

    console.log('\n═══════════════════════════════════════════════════════════════════')
    console.log('📊 ANÁLISE DE SELECTS NA PÁGINA')
    console.log('═══════════════════════════════════════════════════════════════════\n')

    const selectsAnalysis = await page.evaluate(() => {
      const selects = Array.from(document.querySelectorAll('select'))

      return selects.map((select, idx) => {
        const options = Array.from(select.options).map(opt => ({
          value: opt.value,
          text: opt.textContent?.trim()
        }))

        return {
          index: idx,
          name: select.name || '(sem nome)',
          id: select.id || '(sem id)',
          class: select.className || '(sem class)',
          optionsCount: options.length,
          selectedValue: select.value,
          selectedText: select.options[select.selectedIndex]?.textContent?.trim() || '(nenhum)',
          // Mostrar todas as opções
          allOptions: options
        }
      })
    })

    for (const sel of selectsAnalysis) {
      console.log(`\n[${sel.index}] SELECT`)
      console.log(`  name:       "${sel.name}"`)
      console.log(`  id:         "${sel.id}"`)
      console.log(`  class:      "${sel.class}"`)
      console.log(`  options:    ${sel.optionsCount}`)
      console.log(`  selecionado: "${sel.selectedText}" (value="${sel.selectedValue}")`)

      if (sel.optionsCount <= 20) {
        console.log(`  Opções:`)
        for (const opt of sel.allOptions) {
          console.log(`    - "${opt.text}" (value="${opt.value}")`)
        }
      } else {
        console.log(`  Primeiras 10 opções:`)
        for (const opt of sel.allOptions.slice(0, 10)) {
          console.log(`    - "${opt.text}" (value="${opt.value}")`)
        }
        console.log(`  ... (${sel.optionsCount - 10} mais)`)
      }
    }

    // ═══════════════════════════════════════════════════════════════════
    // PROCURAR POR TERMOS RELACIONADOS A FACÇÃO
    // ═══════════════════════════════════════════════════════════════════

    console.log('\n═══════════════════════════════════════════════════════════════════')
    console.log('🔍 PROCURANDO TERMOS RELACIONADOS A FACÇÃO')
    console.log('═══════════════════════════════════════════════════════════════════\n')

    const faccaoSearch = await page.evaluate(() => {
      const results = {
        labels: [] as Array<{text: string, for?: string}>,
        inputs: [] as Array<{name?: string, id?: string, value?: string}>,
        divs: [] as string[],
        selectsWithFaccao: [] as string[]
      }

      // Procurar por labels com "fac"
      const labels = Array.from(document.querySelectorAll('label'))
        .filter(l => l.textContent?.toLowerCase().includes('fac'))

      for (const label of labels) {
        results.labels.push({
          text: label.textContent?.trim() || '',
          for: label.getAttribute('for') || undefined
        })
      }

      // Procurar por inputs/selects com "fac"
      const faccaoInputs = Array.from(document.querySelectorAll('[name*="fac"], [id*="fac"]'))

      for (const input of faccaoInputs) {
        const elem = input as any
        results.inputs.push({
          name: elem.name || undefined,
          id: elem.id || undefined,
          value: elem.value || elem.textContent?.substring(0, 50) || undefined
        })

        if (elem.tagName === 'SELECT') {
          results.selectsWithFaccao.push(elem.name || elem.id || '(sem identificação)')
        }
      }

      // Procurar por divs/spans com "fac" no text
      const textElements = Array.from(document.querySelectorAll('div, span, p'))
        .filter(el => el.textContent?.toLowerCase().includes('fac'))
        .slice(0, 10)

      for (const el of textElements) {
        results.divs.push(el.textContent?.trim().substring(0, 100) || '')
      }

      return results
    })

    if (faccaoSearch.labels.length > 0) {
      console.log('🏷️ Labels com "fac":')
      for (const label of faccaoSearch.labels) {
        console.log(`  - "${label.text}"${label.for ? ` (for="${label.for}")` : ''}`)
      }
    } else {
      console.log('❌ Nenhum label com "fac" encontrado')
    }

    if (faccaoSearch.selectsWithFaccao.length > 0) {
      console.log('\n📋 SELECTs com "fac" no nome/id:')
      for (const name of faccaoSearch.selectsWithFaccao) {
        console.log(`  - ${name}`)
      }
    } else {
      console.log('\n❌ Nenhum SELECT com "fac" encontrado')
    }

    if (faccaoSearch.inputs.length > 0) {
      console.log('\n🔌 Inputs/elements com "fac":')
      for (const input of faccaoSearch.inputs) {
        console.log(`  - name="${input.name}" id="${input.id}" value="${input.value}"`)
      }
    } else {
      console.log('\n❌ Nenhum input com "fac" encontrado')
    }

    if (faccaoSearch.divs.length > 0) {
      console.log('\n📝 Elementos com "fac" no conteúdo:')
      for (const div of faccaoSearch.divs) {
        console.log(`  - ${div.substring(0, 80)}`)
      }
    }

    // ═══════════════════════════════════════════════════════════════════
    // TESTAR SELETORES COMUNS
    // ═══════════════════════════════════════════════════════════════════

    console.log('\n═══════════════════════════════════════════════════════════════════')
    console.log('🧪 TESTANDO SELETORES DE FACÇÃO')
    console.log('═══════════════════════════════════════════════════════════════════\n')

    const selectorTests = [
      'select[name="faccao"]',
      'select[name="faccao_id"]',
      'select[name*="faccao"]',
      'select[id*="faccao"]',
      'select[name="faction"]',
      'select[id*="faction"]',
      'input[name*="faccao"]',
      'select'
    ]

    for (const selector of selectorTests) {
      try {
        const count = await page.locator(selector).count()
        if (count > 0) {
          console.log(`✓ ${selector} → ${count} elemento(s)`)

          const firstElem = await page.locator(selector).first()
          const tagName = await firstElem.evaluate(el => el.tagName)
          const name = await firstElem.evaluate(el => (el as any).name || '(sem name)')
          const id = await firstElem.evaluate(el => el.id || '(sem id)')

          if (tagName === 'SELECT') {
            const optionsCount = await firstElem.locator('option').count()
            const selectedText = await firstElem.evaluate(el =>
              (el as HTMLSelectElement).options[(el as HTMLSelectElement).selectedIndex]?.textContent?.trim()
            )

            console.log(`  → Primeiro: <select name="${name}" id="${id}">`)
            console.log(`  → ${optionsCount} opções, selecionado: "${selectedText}"`)
          }
        } else {
          console.log(`✗ ${selector}`)
        }
      } catch (err) {
        console.log(`✗ ${selector} (erro)`)
      }
    }

    // ═══════════════════════════════════════════════════════════════════
    // SALVAR ANÁLISE COMPLETA
    // ═══════════════════════════════════════════════════════════════════

    const analysisData = {
      apenadoId: TEST_APENADO_ID,
      url: page.url(),
      selectsCount: selectsAnalysis.length,
      selects: selectsAnalysis,
      faccaoSearch,
      timestamp: new Date().toISOString()
    }

    const analysisPath = path.join(DEBUG_DIR, 'apenado-editar-analysis.json')
    fs.writeFileSync(analysisPath, JSON.stringify(analysisData, null, 2))

    console.log(`\n💾 Análise salva em: ${analysisPath}`)
    console.log(`📄 HTML completo salvo em: ${htmlPath}`)

  } catch (err) {
    console.error('\n❌ ERRO:', err)
  } finally {
    await browser.close()
  }
}

debugFaccoesSingle().catch(console.error)
