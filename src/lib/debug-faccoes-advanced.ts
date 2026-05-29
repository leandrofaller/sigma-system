/**
 * Script avançado de debug para inspecionar página de facções do SIPE
 * Fornece análise detalhada da estrutura HTML
 *
 * Uso:
 *   SIPE_USER=usuario SIPE_PASSWORD=senha npx tsx src/lib/debug-faccoes-advanced.ts
 */

import { chromium } from 'playwright'
import * as fs from 'fs'
import * as path from 'path'

const SIPE_URL = 'https://sipe.sejus.ro.gov.br'
const DEBUG_DIR = path.join(process.cwd(), '.debug-sipe')

async function ensureDebugDir() {
  if (!fs.existsSync(DEBUG_DIR)) {
    fs.mkdirSync(DEBUG_DIR, { recursive: true })
  }
}

async function debugFaccoesAdvanced() {
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext()
  const page = await context.newPage()

  try {
    await ensureDebugDir()

    // ═══════════════════════════════════════════════════════════════════
    // FASE 1: LOGIN
    // ═══════════════════════════════════════════════════════════════════

    console.log('\n📍 FASE 1: Fazendo login no SIPE...')
    await page.goto(`${SIPE_URL}/`, { waitUntil: 'networkidle', timeout: 30_000 })

    const user = process.env.SIPE_USER || 'usuario'
    const pwd = process.env.SIPE_PASSWORD || 'senha'

    console.log('📍 Aguardando campos de login...')

    // Tentar diferentes seletores para CPF/Usuário
    const cpfSelectors = [
      'input[name="cpf"]',
      'input[placeholder*="CPF"]',
      'input[type="text"]:first-of-type',
      'input[name="usuario"]'
    ]

    let cpfField = null
    for (const selector of cpfSelectors) {
      try {
        cpfField = page.locator(selector).first()
        if (await cpfField.isVisible({ timeout: 5_000 })) {
          console.log(`✅ Campo CPF encontrado com seletor: ${selector}`)
          break
        }
      } catch {
        // Continuar
      }
    }

    if (!cpfField) {
      throw new Error('Não conseguiu encontrar campo de CPF/Usuário')
    }

    await cpfField.fill(user)
    await page.fill('input[name="senha"]', pwd)
    await page.click('button[type="submit"]')

    console.log('📍 Aguardando redirecionamento para home...')
    try {
      await page.waitForURL('**/home**', { timeout: 30_000 })
    } catch {
      console.log('⚠️  Timeout ao aguardar home, continuando mesmo assim...')
    }
    console.log('✅ Login aparentemente bem-sucedido')

    // ═══════════════════════════════════════════════════════════════════
    // FASE 2: OBTER APENADO
    // ═══════════════════════════════════════════════════════════════════

    console.log('\n📍 FASE 2: Procurando apenado...')
    await page.goto(`${SIPE_URL}/listagem/3/carceragem`, { waitUntil: 'load' })

    const links = await page.$$('tbody a[href*="/selecionarOpcao"]')
    console.log(`✅ Encontrados ${links.length} apenados na listagem`)

    if (links.length === 0) throw new Error('Nenhum apenado encontrado')

    const firstLink = links[0]
    const href = await firstLink.getAttribute('href')
    const match = href?.match(/\/apenados\/(\d+)/)
    if (!match) throw new Error('Não conseguiu extrair ID')

    const apenadoId = match[1]
    console.log(`✅ Apenado ID: ${apenadoId}`)

    // Clicar para registrar
    console.log('\n📍 FASE 3: Registrando apenado na sessão...')
    await firstLink.click()
    await page.waitForTimeout(1500)
    console.log('✅ Apenado registrado')

    // ═══════════════════════════════════════════════════════════════════
    // FASE 4: INSPECIONAR PÁGINA /faccao
    // ═══════════════════════════════════════════════════════════════════

    console.log(`\n📍 FASE 4: Acessando /apenados/${apenadoId}/faccao...`)
    await page.goto(`${SIPE_URL}/apenados/${apenadoId}/faccao`, {
      waitUntil: 'load',
      timeout: 20_000,
    })
    console.log('✅ Página carregada')

    // Salvar HTML para análise
    const html = await page.content()
    const htmlPath = path.join(DEBUG_DIR, 'faccao-page.html')
    fs.writeFileSync(htmlPath, html)
    console.log(`💾 HTML salvo em: ${htmlPath}`)

    await page.waitForTimeout(500)

    // ═══════════════════════════════════════════════════════════════════
    // FASE 5: ANÁLISE DETALHADA
    // ═══════════════════════════════════════════════════════════════════

    console.log('\n📍 FASE 5: Analisando estrutura...')

    const analysis = await page.evaluate(() => {
      const selects = Array.from(document.querySelectorAll('select'))
      const allInputs = Array.from(document.querySelectorAll('input'))
      const allForms = Array.from(document.querySelectorAll('form'))

      return {
        // SELECTs
        selects: selects.map((select, idx) => {
          const label = document.querySelector(`label[for="${select.id}"]`)?.textContent?.trim()
          const parentLabel = select.parentElement?.querySelector('label')?.textContent?.trim()
          const associatedLabel = select.previousElementSibling?.textContent?.trim()

          const options = Array.from(select.options).map(o => ({
            value: o.value,
            text: o.textContent?.trim(),
            disabled: o.disabled,
          }))

          return {
            index: idx,
            name: select.name,
            id: select.id,
            class: select.className,
            labels: { label, parentLabel, associatedLabel },
            optionsCount: options.length,
            options: options.slice(0, 10),
            isVisible: select.offsetParent !== null,
            optionsText: options.map(o => o.text).join(' | '),
          }
        }),

        // INPUTS
        inputs: allInputs
          .filter(inp => inp.name && (inp.name.includes('fac') || inp.type === 'hidden'))
          .map(inp => ({
            type: inp.type,
            name: inp.name,
            id: inp.id,
            value: inp.value,
          })),

        // FORMs
        forms: allForms.map(form => ({
          id: form.id,
          name: form.name,
          action: form.action,
          selectsInForm: form.querySelectorAll('select').length,
        })),

        // Procurar por texto "fac" ou "gênero"
        textMatches: Array.from(document.querySelectorAll('label, legend, .label, [role="label"]'))
          .map(el => el.textContent?.trim())
          .filter(
            text =>
              text &&
              (text.toLowerCase().includes('fac') || text.toLowerCase().includes('gênero') || text.toLowerCase().includes('sexo'))
          ),

        // Body text
        bodyText: document.body.innerText.split('\n').filter(line => line.trim().length > 0),
      }
    })

    // ═══════════════════════════════════════════════════════════════════
    // MOSTRAR RESULTADOS
    // ═══════════════════════════════════════════════════════════════════

    console.log('\n═══════════════════════════════════════════════════════════════════')
    console.log('📊 ANÁLISE COMPLETA')
    console.log('═══════════════════════════════════════════════════════════════════')

    console.log(`\n📋 Total de SELECTs: ${analysis.selects.length}`)

    for (const select of analysis.selects) {
      console.log(
        `\n[${select.index}] ${select.name || 'SEM NOME'} (${select.optionsCount} opções)`
      )
      console.log(
        `    ID: ${select.id || 'N/A'} | Class: ${select.class || 'N/A'}`
      )
      console.log(`    Labels: ${JSON.stringify(select.labels)}`)
      console.log(`    Opções: ${select.optionsText.substring(0, 100)}...`)
      console.log(`    Visível: ${select.isVisible}`)
    }

    console.log(`\n🔍 Inputs com "fac": ${analysis.inputs.length}`)
    for (const inp of analysis.inputs) {
      console.log(`    [${inp.type}] ${inp.name} = "${inp.value}"`)
    }

    console.log(`\n🏷️ Labels relevantes encontradas:`)
    for (const text of analysis.textMatches) {
      console.log(`    - ${text}`)
    }

    // ═══════════════════════════════════════════════════════════════════
    // TESTE DE SELETORES
    // ═══════════════════════════════════════════════════════════════════

    console.log('\n═══════════════════════════════════════════════════════════════════')
    console.log('🧪 TESTE DE SELETORES')
    console.log('═══════════════════════════════════════════════════════════════════')

    const selectorTests = [
      'select[name="faccao_id"]',
      'select[name*="faccao"]',
      'select[id*="faccao"]',
      'select:first-of-type',
      'select:nth-of-type(1)',
      'select:nth-of-type(2)',
      'select',
    ]

    for (const selector of selectorTests) {
      const elements = await page.$$(selector)
      if (elements.length > 0) {
        const firstElem = elements[0]
        const options = await page.evaluate(el => {
          const opts = Array.from(el.querySelectorAll('option'))
            .slice(0, 5)
            .map(o => o.textContent?.trim())
          return opts
        }, firstElem)

        console.log(`\n✓ ${selector}`)
        console.log(`  → ${elements.length} elemento(s)`)
        console.log(`  → Opções: ${options.join(', ')}`)

        // Detectar se é gênero
        const hasGender = options.some(opt => {
          const lower = (opt || '').toLowerCase()
          return (
            lower.includes('masculino') ||
            lower.includes('feminino') ||
            lower.includes('não informado')
          )
        })

        if (hasGender) {
          console.log(`  ⚠️ AVISO: Este é SELECT DE GÊNERO! (tem Masculino/Feminino)`)
        } else {
          console.log(`  ✅ VALIDADO: Não é gênero`)
        }
      }
    }

    // ═══════════════════════════════════════════════════════════════════
    // RECOMENDAÇÃO
    // ═══════════════════════════════════════════════════════════════════

    console.log('\n═══════════════════════════════════════════════════════════════════')
    console.log('💡 RECOMENDAÇÃO')
    console.log('═══════════════════════════════════════════════════════════════════')

    // Encontrar o melhor seletor
    const bestSelector = analysis.selects.find(
      s =>
        s.name === 'faccao_id' ||
        (s.name && s.name.includes('fac')) ||
        (s.optionsText &&
          !s.optionsText.toLowerCase().includes('masculino') &&
          s.optionsCount > 5)
    )

    if (bestSelector) {
      console.log(`\n✅ USAR ESTE SELETOR:`)
      if (bestSelector.name) {
        console.log(`   select[name="${bestSelector.name}"]`)
      } else if (bestSelector.id) {
        console.log(`   select#${bestSelector.id}`)
      } else {
        console.log(`   select:nth-of-type(${bestSelector.index + 1})`)
      }
      console.log(`   Contém: ${bestSelector.optionsText.substring(0, 80)}...`)
    } else {
      console.log(`\n❌ PROBLEMA: Nenhum seletor de facção válido foi encontrado!`)
      console.log(`\nPossíveis causas:`)
      console.log(`1. A página /faccao pode estar quebrada neste apenado`)
      console.log(`2. Tentar outro apenado (números diferentes)`)
      console.log(`3. Ou tentar a página /editar em vez de /faccao`)
    }

    // Salvar análise em JSON
    const analysisPath = path.join(DEBUG_DIR, 'analysis.json')
    fs.writeFileSync(analysisPath, JSON.stringify(analysis, null, 2))
    console.log(`\n💾 Análise completa salva em: ${analysisPath}`)

  } catch (err) {
    console.error('\n❌ ERRO:', err)
  } finally {
    await browser.close()
  }
}

debugFaccoesAdvanced().catch(console.error)
