/**
 * Script de diagnóstico: apenas acessa SIPE e mostra o HTML
 */

import { chromium } from 'playwright'
import * as fs from 'fs'
import * as path from 'path'

const SIPE_URL = 'https://sipe.sejus.ro.gov.br'
const DEBUG_DIR = path.join(process.cwd(), '.debug-sipe')

async function diagnosticarLogin() {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()

  try {
    if (!fs.existsSync(DEBUG_DIR)) {
      fs.mkdirSync(DEBUG_DIR, { recursive: true })
    }

    console.log('\n🔍 Acessando SIPE...')
    await page.goto(`${SIPE_URL}/`, { waitUntil: 'domcontentloaded', timeout: 30_000 })

    console.log('✅ Página carregada')

    // Obter o HTML completo
    const html = await page.content()
    const htmlPath = path.join(DEBUG_DIR, 'login-page.html')
    fs.writeFileSync(htmlPath, html)
    console.log(`\n📄 HTML da página salvo em: ${htmlPath}`)

    // Procurar por inputs e formulários
    const pageInfo = await page.evaluate(() => {
      return {
        title: document.title,
        url: window.location.href,
        inputs: Array.from(document.querySelectorAll('input')).map(inp => ({
          type: inp.type,
          name: inp.name,
          id: inp.id,
          placeholder: inp.placeholder,
          visible: inp.offsetParent !== null,
        })),
        buttons: Array.from(document.querySelectorAll('button')).map(btn => ({
          type: btn.type,
          text: btn.textContent?.trim(),
          visible: btn.offsetParent !== null,
        })),
        forms: Array.from(document.querySelectorAll('form')).length,
        bodyText: document.body.innerText.substring(0, 500),
      }
    })

    console.log('\n═══════════════════════════════════════════════════════════════')
    console.log('📊 INFORMAÇÕES DA PÁGINA')
    console.log('═══════════════════════════════════════════════════════════════\n')

    console.log(`URL: ${pageInfo.url}`)
    console.log(`Title: ${pageInfo.title}`)
    console.log(`Formulários: ${pageInfo.forms}`)

    console.log('\n📝 INPUTS ENCONTRADOS:')
    for (const inp of pageInfo.inputs) {
      console.log(`  - [${inp.type}] name="${inp.name}" id="${inp.id}" placeholder="${inp.placeholder}" (visível: ${inp.visible})`)
    }

    console.log('\n🔘 BUTTONS ENCONTRADOS:')
    for (const btn of pageInfo.buttons) {
      console.log(`  - [${btn.type}] "${btn.text}" (visível: ${btn.visible})`)
    }

    console.log('\n📋 PRIMEIRAS 500 CARACTERES DO BODY:')
    console.log(pageInfo.bodyText)

    console.log('\n\n✅ Verifique o arquivo HTML completo em:')
    console.log(`   ${htmlPath}`)
    console.log('\nAbra este arquivo no navegador (abrir com navegador) para inspecionar o formulário.')

  } catch (err) {
    console.error('\n❌ ERRO:', err)
  } finally {
    await browser.close()
  }
}

diagnosticarLogin().catch(console.error)
