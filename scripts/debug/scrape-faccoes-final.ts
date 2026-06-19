/**
 * Script final: Extrair facções de TODOS os 51 apenados
 * Estratégia:
 * 1. Acessar /apenados/index
 * 2. Extrair IDs dos 51 apenados
 * 3. Para cada apenado, entrar em /apenados/{id}/editar
 * 4. Extrair a facção do select
 * 5. Salvar relatório
 */

import { chromium } from 'playwright'
import * as fs from 'fs'
import * as path from 'path'

const SIPE_URL = 'https://sipe.sejus.ro.gov.br'
const DEBUG_DIR = path.join(process.cwd(), '.debug-sipe')

interface Apenado {
  id: string
  nome: string
  faccao?: string
}

async function scrapeFaccoesFinish() {
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext()
  const page = await context.newPage()

  const apenados: Apenado[] = []

  try {
    if (!fs.existsSync(DEBUG_DIR)) {
      fs.mkdirSync(DEBUG_DIR, { recursive: true })
    }

    // ═══════════════════════════════════════════════════════════════════
    // FASE 1: LOGIN
    // ═══════════════════════════════════════════════════════════════════

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

    console.log('✅ Login completo')

    // ═══════════════════════════════════════════════════════════════════
    // FASE 2: EXTRAIR IDs DOS APENADOS
    // ═══════════════════════════════════════════════════════════════════

    console.log('\n📍 FASE 2: Acessando /apenados/index...')
    await page.goto(`${SIPE_URL}/apenados/index`, {
      waitUntil: 'networkidle',
      timeout: 20_000
    })
    console.log('✅ Página carregada')

    // Extrair dados da tabela
    const tabelaDados = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('table tbody tr'))

      return rows
        .map(row => {
          const cells = Array.from(row.querySelectorAll('td'))
          const id = cells[0]?.textContent?.trim()
          const nome = cells[1]?.textContent?.trim()

          return { id, nome }
        })
        .filter(item => item.id && item.nome)
    })

    console.log(`✅ Encontrados ${tabelaDados.length} apenados`)

    for (const dados of tabelaDados) {
      apenados.push({
        id: dados.id!,
        nome: dados.nome!
      })
    }

    // ═══════════════════════════════════════════════════════════════════
    // FASE 3: EXTRAIR FACÇÕES
    // ═══════════════════════════════════════════════════════════════════

    console.log('\n📍 FASE 3: Extraindo facções...')

    for (let i = 0; i < apenados.length; i++) {
      const apenado = apenados[i]
      const progress = `[${i + 1}/${apenados.length}]`

      try {
        // Tentar acessar página de edição
        await page.goto(`${SIPE_URL}/apenados/${apenado.id}/editar`, {
          waitUntil: 'domcontentloaded',
          timeout: 10_000
        })

        // Extrair facção do select
        const faccao = await page.evaluate(() => {
          // Procurar por seletores de facção em ordem de especificidade
          const selectors = [
            'select[name="faccao"]',
            'select[name="faccao_id"]',
            'select[name*="faccao"]',
            'select[id*="faccao"]'
          ]

          for (const selector of selectors) {
            const elem = document.querySelector(selector) as HTMLSelectElement
            if (elem) {
              const selectedOption = elem.options[elem.selectedIndex]
              if (selectedOption) {
                const text = selectedOption.textContent?.trim()
                // Verificar se não é gênero
                if (text && !text.toLowerCase().includes('masculino') && !text.toLowerCase().includes('feminino')) {
                  return text
                }
              }
            }
          }

          return null
        })

        if (faccao) {
          apenado.faccao = faccao
          console.log(`${progress} ✅ ${apenado.nome}: ${faccao}`)
        } else {
          console.log(`${progress} ⚠️  ${apenado.nome}: facção não encontrada`)
        }
      } catch (err) {
        console.log(`${progress} ❌ ${apenado.nome}: erro - ${err}`)
      }

      // Pequeno delay para não sobrecarregar o servidor
      await page.waitForTimeout(300)
    }

    // ═══════════════════════════════════════════════════════════════════
    // FASE 4: GERAR RELATÓRIO
    // ═══════════════════════════════════════════════════════════════════

    console.log('\n📍 FASE 4: Gerando relatório...')

    const comFaccao = apenados.filter(a => a.faccao).length
    const semFaccao = apenados.length - comFaccao

    const relatorio = {
      data: new Date().toISOString(),
      total: apenados.length,
      comFaccao,
      semFaccao,
      apenados
    }

    const relatorioPath = path.join(DEBUG_DIR, 'faccoes-resultado.json')
    fs.writeFileSync(relatorioPath, JSON.stringify(relatorio, null, 2))

    console.log('\n═══════════════════════════════════════════════════════════════════')
    console.log('📊 RESULTADO FINAL')
    console.log('═══════════════════════════════════════════════════════════════════\n')

    console.log(`Total de apenados: ${relatorio.total}`)
    console.log(`Com facção: ${relatorio.comFaccao}`)
    console.log(`Sem facção: ${relatorio.semFaccao}`)

    console.log('\n📋 Apenados com facção:')
    for (const a of apenados.filter(a => a.faccao)) {
      console.log(`  - ${a.nome}: ${a.faccao}`)
    }

    if (semFaccao > 0) {
      console.log('\n⚠️  Apenados sem facção:')
      for (const a of apenados.filter(a => !a.faccao)) {
        console.log(`  - ${a.nome}`)
      }
    }

    console.log(`\n💾 Relatório completo salvo em: ${relatorioPath}`)
  } catch (err) {
    console.error('\n❌ ERRO:', err)
  } finally {
    await browser.close()
  }
}

scrapeFaccoesFinish().catch(console.error)
