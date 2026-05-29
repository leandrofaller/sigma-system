import { chromium } from 'playwright'

/**
 * Script de debug para inspecionar a página de facções do SIPE
 * Mostra todos os selects disponíveis e seus atributos
 */
async function inspectFaccoesPage() {
  const browser = await chromium.launch()
  const context = await browser.createBrowserContext()
  const page = await context.newPage()

  try {
    // Login
    console.log('📍 Fazendo login no SIPE...')
    await page.goto('https://sipe.sejus.ro.gov.br/', { waitUntil: 'load', timeout: 30_000 })

    // Preencher credenciais
    await page.fill('input[name="usuario"]', process.env.SIPE_USER || 'usuario')
    await page.fill('input[name="senha"]', process.env.SIPE_PASSWORD || 'senha')
    await page.click('button[type="submit"]')
    await page.waitForURL('**/home**', { timeout: 30_000 })

    // Ir para listagem de apenados
    console.log('📍 Acessando listagem de apenados...')
    await page.goto('https://sipe.sejus.ro.gov.br/listagem/3/carceragem', { waitUntil: 'load' })

    // Pegar primeiro apenado
    const firstLink = await page.$('tbody a[href*="/selecionarOpcao"]')
    if (!firstLink) throw new Error('Nenhum apenado encontrado')

    const href = await firstLink.getAttribute('href')
    const match = href?.match(/\/apenados\/(\d+)/)
    if (!match) throw new Error('Não conseguiu extrair ID do apenado')

    const apenadoId = match[1]
    console.log(`📍 Apenado ID: ${apenadoId}`)

    // Acessar página de facção
    console.log(`📍 Acessando /apenados/${apenadoId}/faccao...`)
    await page.goto(`https://sipe.sejus.ro.gov.br/apenados/${apenadoId}/faccao`, { waitUntil: 'load' })

    // Inspecionar todos os selects
    const selects = await page.$$eval('select', (elements: HTMLSelectElement[]) => {
      return elements.map((el, idx) => ({
        index: idx,
        name: el.name,
        id: el.id,
        className: el.className,
        options: Array.from(el.options).slice(0, 5).map(o => ({ text: o.textContent, value: o.value })),
        totalOptions: el.options.length,
        parent: el.parentElement?.tagName + ' ' + el.parentElement?.className,
        label: el.previousElementSibling?.textContent || 'N/A'
      }))
    })

    console.log('\n🔍 SELECTS ENCONTRADOS:')
    console.log(JSON.stringify(selects, null, 2))

    // Também procurar por labels
    console.log('\n🏷️ LABELS NA PÁGINA:')
    const labels = await page.$$eval('label', (elements: HTMLLabelElement[]) => {
      return elements.map((el) => ({
        text: el.textContent,
        forAttribute: el.getAttribute('for'),
        relatedSelect: el.nextElementSibling?.tagName || 'N/A'
      }))
    })
    console.log(JSON.stringify(labels, null, 2))

    // Inspecionar a estrutura geral
    console.log('\n📋 ESTRUTURA DA PÁGINA:')
    const structure = await page.evaluate(() => {
      const forms = document.querySelectorAll('form')
      return Array.from(forms).map((form, idx) => ({
        formIndex: idx,
        formId: form.id,
        formName: form.name,
        selects: Array.from(form.querySelectorAll('select')).map((select: any) => ({
          name: select.name,
          id: select.id,
          firstOption: select.options[0]?.text
        }))
      }))
    })
    console.log(JSON.stringify(structure, null, 2))

  } finally {
    await browser.close()
  }
}

inspectFaccoesPage().catch(console.error)
