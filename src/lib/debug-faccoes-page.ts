/**
 * Script de debug para inspecionar a página de facções do SIPE
 * Mostra todos os selects disponíveis, seus atributos e opções
 */

import { chromium } from 'playwright'

const SIPE_URL = 'https://sipe.sejus.ro.gov.br'

async function debugFaccoesPage() {
  const browser = await chromium.launch()
  const context = await browser.createBrowserContext()
  const page = await context.newPage()

  try {
    // Login
    console.log('📍 Fazendo login no SIPE...')
    await page.goto(`${SIPE_URL}/`, { waitUntil: 'load', timeout: 30_000 })

    // Preencher credenciais
    const user = process.env.SIPE_USER || 'usuario'
    const pwd = process.env.SIPE_PASSWORD || 'senha'

    await page.fill('input[name="usuario"]', user)
    await page.fill('input[name="senha"]', pwd)
    await page.click('button[type="submit"]')
    await page.waitForURL('**/home**', { timeout: 30_000 })
    console.log('✅ Login bem-sucedido')

    // Ir para listagem de apenados
    console.log('📍 Acessando listagem de apenados...')
    await page.goto(`${SIPE_URL}/listagem/3/carceragem`, { waitUntil: 'load' })

    // Pegar primeiro apenado
    const firstLink = await page.$('tbody a[href*="/selecionarOpcao"]')
    if (!firstLink) throw new Error('Nenhum apenado encontrado')

    const href = await firstLink.getAttribute('href')
    const match = href?.match(/\/apenados\/(\d+)/)
    if (!match) throw new Error('Não conseguiu extrair ID do apenado')

    const apenadoId = match[1]
    console.log(`📍 Apenado ID: ${apenadoId}`)

    // Clicar para registrar na sessão
    console.log(`🖱️ Clicando no apenado...`)
    await firstLink.click()
    await page.waitForTimeout(1500)

    // 🔍 INSPECIONAR PÁGINA DE FACÇÃO
    console.log(`\n🔍 ACESSANDO /apenados/${apenadoId}/faccao...`)
    await page.goto(`${SIPE_URL}/apenados/${apenadoId}/faccao`, {
      waitUntil: 'load',
      timeout: 20_000,
    })

    // Aguardar um pouco para elementos renderizarem
    await page.waitForTimeout(1000)

    // ═══════════════════════════════════════════════════════════════════
    // ANÁLISE COMPLETA DA PÁGINA
    // ═══════════════════════════════════════════════════════════════════

    const pageInfo = await page.evaluate(() => {
      const selects = Array.from(document.querySelectorAll('select'))

      return {
        url: window.location.href,
        title: document.title,
        totalSelects: selects.length,
        selects: selects.map((select, idx) => {
          const parent = select.parentElement
          const label = document.querySelector(
            `label[for="${select.id}"]`
          )?.textContent?.trim()

          return {
            index: idx,
            name: select.name || 'SEM NOME',
            id: select.id || 'SEM ID',
            className: select.className || 'SEM CLASS',
            ariaLabel: select.getAttribute('aria-label') || 'N/A',
            label: label || 'SEM LABEL',
            parentTag: parent?.tagName,
            parentClass: parent?.className || 'N/A',
            dataAttributes: {
              ...Array.from(select.attributes)
                .filter(attr => attr.name.startsWith('data-'))
                .reduce(
                  (acc, attr) => ({ ...acc, [attr.name]: attr.value }),
                  {}
                ),
            },
            optionsCount: select.options.length,
            options: Array.from(select.options)
              .slice(0, 10) // Primeiras 10 opções
              .map(o => ({
                value: o.value,
                text: o.textContent?.trim(),
                selected: o.selected,
              })),
            isVisible: select.offsetParent !== null,
          }
        }),

        // Procurar por labels também
        labels: Array.from(document.querySelectorAll('label')).map(label => ({
          text: label.textContent?.trim(),
          for: label.getAttribute('for'),
          associated: label.nextElementSibling?.tagName,
        })),

        // Procurar por divs que possam conter info de facção
        textContent: document.body.innerText
          .split('\n')
          .filter(
            line =>
              line.toLowerCase().includes('fac') ||
              line.toLowerCase().includes('sexo') ||
              line.toLowerCase().includes('gênero') ||
              line.toLowerCase().includes('masculino') ||
              line.toLowerCase().includes('feminino')
          )
          .slice(0, 20),
      }
    })

    console.log('\n═══════════════════════════════════════════════════════════════════')
    console.log('📊 ANÁLISE DA PÁGINA DE FACÇÕES')
    console.log('═══════════════════════════════════════════════════════════════════\n')

    console.log(`URL: ${pageInfo.url}`)
    console.log(`Title: ${pageInfo.title}`)
    console.log(`Total de SELECTs na página: ${pageInfo.totalSelects}\n`)

    console.log('🔍 SELECTS ENCONTRADOS:')
    console.log('───────────────────────────────────────────────────────────────────')

    for (const select of pageInfo.selects) {
      console.log(`\n[${select.index}] SELECT`)
      console.log(`  name: "${select.name}"`)
      console.log(`  id: "${select.id}"`)
      console.log(`  class: "${select.className}"`)
      console.log(`  aria-label: "${select.ariaLabel}"`)
      console.log(`  label associada: "${select.label}"`)
      console.log(`  parent: <${select.parentTag} class="${select.parentClass}">`)
      console.log(`  visível: ${select.isVisible}`)
      console.log(`  opções: ${select.optionsCount}`)
      console.log(`  data-attributes:`, select.dataAttributes)

      console.log(`  Primeiras opções:`)
      for (const opt of select.options) {
        console.log(
          `    - value="${opt.value}" → "${opt.text}"${opt.selected ? ' (SELECIONADA)' : ''}`
        )
      }
    }

    console.log('\n🏷️ LABELS NA PÁGINA:')
    console.log('───────────────────────────────────────────────────────────────────')
    for (const label of pageInfo.labels) {
      if (
        label.text?.toLowerCase().includes('fac') ||
        label.text?.toLowerCase().includes('sexo') ||
        label.text?.toLowerCase().includes('gênero')
      ) {
        console.log(
          `  "${label.text}" (for="${label.for}") → <${label.associated}>`
        )
      }
    }

    console.log('\n📝 TRECHOS DE TEXTO COM "fac", "sexo", "gênero":')
    console.log('───────────────────────────────────────────────────────────────────')
    for (const text of pageInfo.textContent) {
      console.log(`  ${text}`)
    }

    // ═══════════════════════════════════════════════════════════════════
    // TESTE DE SELETORES
    // ═══════════════════════════════════════════════════════════════════

    console.log('\n\n🧪 TESTE DE SELETORES:')
    console.log('═══════════════════════════════════════════════════════════════════')

    const selectorTests = [
      'select[name="faccao_id"]',
      'select[name*="faccao"]',
      'select[id*="faccao"]',
      'select[name="sexo"]',
      'select[name*="sexo"]',
      'select:nth-of-type(1)',
      'select:nth-of-type(2)',
      'select:nth-of-type(3)',
      'select',
    ]

    for (const selector of selectorTests) {
      try {
        const elements = await page.$$(selector)
        if (elements.length > 0) {
          const elem = elements[0]
          const info = await page.evaluate(el => {
            const opts = Array.from(el.querySelectorAll('option'))
              .slice(0, 5)
              .map(o => o.textContent?.trim())

            return {
              name: (el as HTMLSelectElement).name,
              options: opts,
            }
          }, elem)

          console.log(`\n✓ ${selector}`)
          console.log(`  → Encontrou ${elements.length} elemento(s)`)
          console.log(`  → Select name="${info.name}"`)
          console.log(`  → Opções: ${info.options.join(', ')}`)
        }
      } catch (err) {
        console.log(`\n✗ ${selector} → Erro`)
      }
    }

    // ═══════════════════════════════════════════════════════════════════
    // TESTE NA PÁGINA /editar
    // ═══════════════════════════════════════════════════════════════════

    console.log('\n\n🔍 TESTANDO PÁGINA /editar:')
    console.log('═══════════════════════════════════════════════════════════════════')

    await page.goto(`${SIPE_URL}/apenados/${apenadoId}/editar`, {
      waitUntil: 'domcontentloaded',
      timeout: 15_000,
    })

    await page.waitForTimeout(1000)

    const editPageInfo = await page.evaluate(() => {
      const selects = Array.from(document.querySelectorAll('select'))

      return {
        url: window.location.href,
        totalSelects: selects.length,
        selects: selects.map((select, idx) => {
          const label = document.querySelector(
            `label[for="${select.id}"]`
          )?.textContent?.trim()

          return {
            index: idx,
            name: select.name || 'SEM NOME',
            id: select.id || 'SEM ID',
            label: label || 'N/A',
            optionsCount: select.options.length,
            firstOptions: Array.from(select.options)
              .slice(0, 5)
              .map(o => o.textContent?.trim()),
          }
        }),
      }
    })

    console.log(`\nURL: ${editPageInfo.url}`)
    console.log(`Total de SELECTs: ${editPageInfo.totalSelects}\n`)

    for (const select of editPageInfo.selects) {
      console.log(`[${select.index}] name="${select.name}" | label="${select.label}"`)
      console.log(`    Opções: ${select.firstOptions.join(', ')}`)
    }

  } finally {
    await browser.close()
  }
}

debugFaccoesPage().catch(console.error)
