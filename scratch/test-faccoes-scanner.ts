import { chromium } from 'playwright'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const SIPE_URL = 'https://sipe.sejus.ro.gov.br'

async function main() {
  const apenados = await prisma.sipeApenadoImportado.findMany({
    orderBy: { sipeId: 'desc' },
    select: { sipeId: true, nome: true }
  })

  console.log(`[SCANNER] Lidos ${apenados.length} apenados do banco local.`)

  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext()
  const page = await context.newPage()

  try {
    console.log('[SCANNER] Fazendo login no SIPE...')
    await page.goto(`${SIPE_URL}/`, { waitUntil: 'networkidle', timeout: 30_000 })

    const user = process.env.SIPE_CPF || '77032055249'
    const pwd = process.env.SIPE_SENHA || 'jxa7HWK@axw*mtw3avg'

    await page.waitForSelector('input[name="cpf"]', { timeout: 15_000 })
    await page.fill('input[name="cpf"]', user)
    await page.waitForSelector('input[type="password"]', { timeout: 5_000 })
    await page.fill('input[type="password"]', pwd)
    await page.click('button[type="submit"]')
    await page.waitForTimeout(2000)

    const perfilPage = await page.locator('text="Selecione o Perfil Desejado"').isVisible({ timeout: 3_000 }).catch(() => false)
    if (perfilPage) {
      const selectDropdown = page.locator('select').first()
      if (await selectDropdown.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await selectDropdown.selectOption({ label: 'Master' })
      }
      await page.locator('button:has-text("ENTRAR")').click()
      await page.waitForTimeout(2000)
    }

    if (page.url().includes('/selectRole')) {
      const selectRole = page.locator('select').first()
      if (await selectRole.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await selectRole.selectOption({ label: 'Master' })
      }
      await page.locator('button:has-text("ENTRAR")').click()
      await page.waitForTimeout(2000)
    }

    console.log('[SCANNER] Login concluído com sucesso!')

    let encontrado = false

    for (let i = 0; i < apenados.length; i++) {
      const ap = apenados[i]
      const progress = `[${i + 1}/${apenados.length}]`
      
      // Ignorar IDs de teste negativos
      if (ap.sipeId < 0) continue

      try {
        console.log(`${progress} Verificando apenado: ${ap.nome} (SIPE ID: ${ap.sipeId})...`)
        await page.goto(`${SIPE_URL}/apenados/${ap.sipeId}/editar`, { waitUntil: 'domcontentloaded', timeout: 10_000 })

        const faccaoIdVal = await page.evaluate(() => {
          const el = document.querySelector('[name="faccao_id"]') as HTMLInputElement | null
          return el ? el.value : null
        })

        console.log(`  -> faccao_id no HTML: "${faccaoIdVal}"`)

        if (faccaoIdVal && faccaoIdVal !== '0' && faccaoIdVal !== '') {
          console.log(`🌟 Apenado ${ap.nome} TEM facção vinculada (ID: ${faccaoIdVal})! Tentando acessar página /faccao...`)
          
          await page.goto(`${SIPE_URL}/apenados/${ap.sipeId}/faccao`, { waitUntil: 'load', timeout: 15_000 })
          
          const html = await page.content()
          if (html.includes("Trying to get property")) {
            console.log(`❌ Erro no SIPE ao carregar /faccao para este apenado também.`)
            continue
          }

          // Procurar o select de facção
          const options = await page.evaluate(() => {
            const selectors = [
              'select[name="faccao_id"]',
              'select[name*="faccao"]',
              'select[id*="faccao"]',
              'select'
            ]
            
            for (const sel of selectors) {
              const el = document.querySelector(sel) as HTMLSelectElement | null
              if (el) {
                // Verificar se não é gênero
                const testOpts = Array.from(el.options).map(o => o.textContent?.trim() || '')
                const hasGender = testOpts.some(t => 
                  t.toLowerCase().includes('masculino') || 
                  t.toLowerCase().includes('feminino')
                )
                if (hasGender) continue

                return Array.from(el.options)
                  .filter(o => o.value && o.value !== '0' && o.value !== '')
                  .map(o => ({ value: o.value, text: o.textContent?.trim() || '' }))
              }
            }
            return null
          })

          if (options && options.length > 0) {
            console.log(`🎉 Sucesso! Facções encontradas:`, options)
            encontrado = true
            break
          } else {
            console.log(`⚠️  Página carregou mas nenhum select de facção válido foi encontrado.`)
          }
        }
      } catch (err) {
        console.log(`  -> Erro ao verificar apenado ${ap.sipeId}: ${err}`)
      }
      
      // Delay curto
      await page.waitForTimeout(300)
    }

    if (!encontrado) {
      console.log(`❌ Nenhum apenado com facção válida foi encontrado na base local.`)
    }

  } catch (err) {
    console.error('❌ Erro no processo:', err)
  } finally {
    await browser.close()
    await prisma.$disconnect()
  }
}

main()
