/**
 * Script de debug: Testar diferentes URLs para encontrar onde fica a facção
 */

import { chromium } from 'playwright'
import * as fs from 'fs'
import * as path from 'path'

const SIPE_URL = 'https://sipe.sejus.ro.gov.br'
const DEBUG_DIR = path.join(process.cwd(), '.debug-sipe')
const TEST_APENADO_ID = '64475'

// Lista de URLs a testar
const URLS_TO_TEST = [
  `/apenados/${TEST_APENADO_ID}`,
  `/apenados/${TEST_APENADO_ID}/`,
  `/apenados/${TEST_APENADO_ID}/faccao`,
  `/apenados/${TEST_APENADO_ID}/faccoes`,
  `/apenados/${TEST_APENADO_ID}/facção`,
  `/apenados/${TEST_APENADO_ID}/info`,
  `/apenados/${TEST_APENADO_ID}/ficha`,
  `/apenados/${TEST_APENADO_ID}/detalhes`,
  `/apenados/${TEST_APENADO_ID}/dados`,
  `/fichaCela/${TEST_APENADO_ID}`,
  `/relatorios/fichaGeral?apenado=${TEST_APENADO_ID}`,
  `/relatorios/fichaGeral?id=${TEST_APENADO_ID}`,
  `/relatorios/fichaGeral?sipeId=${TEST_APENADO_ID}`
]

async function debugFaccoesUrls() {
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

    // Detectar página /selectRole
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
    // TESTAR URLS
    // ═══════════════════════════════════════════════════════════════════

    console.log('═══════════════════════════════════════════════════════════════════')
    console.log('🔍 TESTANDO URLS PARA ENCONTRAR FACÇÃO')
    console.log('═══════════════════════════════════════════════════════════════════\n')

    const results = []

    for (const url of URLS_TO_TEST) {
      const fullUrl = SIPE_URL + url

      try {
        console.log(`📡 Testando: ${url}`)

        await page.goto(fullUrl, {
          waitUntil: 'domcontentloaded',
          timeout: 10_000
        })

        // Verificar status
        const statusCode = page.response?.status() || 200
        const pageTitle = await page.title()
        const currentUrl = page.url()

        // Procurar por "faccao" no HTML
        const html = await page.content()
        const hasFaccao = html.toLowerCase().includes('faccao') || html.toLowerCase().includes('faction')

        // Procurar por selects
        const selectCount = await page.locator('select').count()
        const selectsWithFaccao = await page.evaluate(() => {
          return Array.from(document.querySelectorAll('select'))
            .filter(s => s.name.toLowerCase().includes('fac') || s.id.toLowerCase().includes('fac'))
            .map(s => ({ name: s.name, id: s.id }))
        })

        // Procurar por texto "facção"
        const faccaoText = await page.locator('text=/facção|faction/i').count()

        const result = {
          urlTestado: url,
          urlRedirecionou: currentUrl !== fullUrl ? currentUrl : null,
          statusCode,
          titulo: pageTitle,
          temFaccaoNoHTML: hasFaccao,
          selectsTotais: selectCount,
          selectsComFaccao: selectsWithFaccao,
          ocorrenciasFaccaoText: faccaoText,
          conteudoUtil: false
        }

        // Determinar se é útil
        if (hasFaccao || selectsWithFaccao.length > 0 || faccaoText > 0) {
          result.conteudoUtil = true
          console.log(`  ✅ CONTÉM FACÇÃO!`)
        } else {
          console.log(`  ❌ Não contém facção`)
        }

        results.push(result)
      } catch (err) {
        const error = err as any
        console.log(`  ❌ ERRO: ${error.message?.substring(0, 50)}`)
        results.push({
          urlTestado: url,
          erro: error.message?.substring(0, 100)
        })
      }

      await page.waitForTimeout(500)
    }

    // ═══════════════════════════════════════════════════════════════════
    // RESUMO
    // ═══════════════════════════════════════════════════════════════════

    console.log('\n═══════════════════════════════════════════════════════════════════')
    console.log('📊 RESUMO DOS TESTES')
    console.log('═══════════════════════════════════════════════════════════════════\n')

    const comFaccao = results.filter(r => r.conteudoUtil)

    if (comFaccao.length > 0) {
      console.log(`✅ ENCONTRADAS ${comFaccao.length} URL(s) COM FACÇÃO:\n`)
      for (const result of comFaccao) {
        console.log(`  📍 ${result.urlTestado}`)
        if (result.selectsComFaccao?.length > 0) {
          console.log(`     - Selects: ${result.selectsComFaccao.map(s => s.name).join(', ')}`)
        }
        if (result.ocorrenciasFaccaoText > 0) {
          console.log(`     - Menções a "facção": ${result.ocorrenciasFaccaoText}`)
        }
      }
    } else {
      console.log('❌ NENHUMA URL CONTÉM FACÇÃO')
      console.log('\nURLs testadas:')
      for (const result of results) {
        if (result.erro) {
          console.log(`  - ${result.urlTestado} → ERRO`)
        } else {
          console.log(`  - ${result.urlTestado} → ${result.selectsTotais} selects`)
        }
      }
    }

    // Salvar resultados
    const resultsPath = path.join(DEBUG_DIR, 'urls-teste-resultado.json')
    fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2))
    console.log(`\n💾 Resultados salvos em: ${resultsPath}`)

  } catch (err) {
    console.error('\n❌ ERRO:', err)
  } finally {
    await browser.close()
  }
}

debugFaccoesUrls().catch(console.error)
