import { chromium } from 'playwright'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const SIPE_URL = 'https://sipe.sejus.ro.gov.br'

async function main() {
  console.log('[FIX] Iniciando script de correção retroativa de facções de apenados...')

  // 1. Ler todas as facções cadastradas no banco local
  const faccoes = await prisma.sipeFaccao.findMany()
  const faccoesMap = new Map<number, string>() // sipeId -> CUID local
  for (const f of faccoes) {
    faccoesMap.set(f.sipeId, f.id)
  }
  console.log(`[FIX] Lidas ${faccoes.length} facções do banco local.`)

  if (faccoes.length === 0) {
    console.log('[FIX] ❌ Erro: Nenhuma facção cadastrada no banco. Execute a importação de facções primeiro.')
    return
  }

  // 2. Ler todos os apenados importados que estão com faccaoId nulo
  const apenados = await prisma.sipeApenadoImportado.findMany({
    where: { 
      faccaoId: null,
      sipeId: { gt: 0 } // Ignorar registros stubs com IDs negativos
    },
    select: { id: true, sipeId: true, nome: true }
  })

  console.log(`[FIX] Encontrados ${apenados.length} apenados sem facção associada no banco local.`)

  if (apenados.length === 0) {
    console.log('[FIX] ✅ Todos os apenados já possuem associação de facção.')
    return
  }

  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext()
  const page = await context.newPage()

  try {
    console.log('[FIX] Fazendo login no SIPE...')
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

    console.log('[FIX] Login concluído com sucesso!')

    let atualizados = 0

    for (let i = 0; i < apenados.length; i++) {
      const ap = apenados[i]
      const progress = `[${i + 1}/${apenados.length}]`

      try {
        console.log(`${progress} Mapeando apenado: ${ap.nome} (#${ap.sipeId})...`)
        await page.goto(`${SIPE_URL}/apenados/${ap.sipeId}/editar`, { waitUntil: 'domcontentloaded', timeout: 10_000 })

        const faccaoIdVal = await page.evaluate(() => {
          const el = document.querySelector('[name="faccao_id"]') as HTMLInputElement | null
          return el ? el.value : null
        })

        if (faccaoIdVal && faccaoIdVal !== '0' && faccaoIdVal !== '') {
          let sipeFacId = parseInt(faccaoIdVal)
          if (sipeFacId === 8) {
            sipeFacId = 2 // Mescla SIPE ID 8 (PCC) no SIPE ID 2 (Primeiro Comando da Capital)
          }
          const localFaccaoId = faccoesMap.get(sipeFacId)

          if (localFaccaoId) {
            await prisma.sipeApenadoImportado.update({
              where: { id: ap.id },
              data: { faccaoId: localFaccaoId }
            })
            console.log(`  -> ✅ Associado à facção local! (SIPE Faccao ID: ${sipeFacId})`)
            atualizados++
          } else {
            console.log(`  -> ⚠️ ID de facção do SIPE ${sipeFacId} não correspondido na tabela local.`)
          }
        } else {
          console.log(`  -> Sem facção (faccao_id = 0)`)
        }
      } catch (err) {
        console.log(`  -> ❌ Erro ao processar apenado ${ap.sipeId}: ${err}`)
      }

      await page.waitForTimeout(200)
    }

    console.log(`\n[FIX] ✅ Concluído! Total de apenados atualizados com a facção correta: ${atualizados}`)

  } catch (err) {
    console.error('[FIX] ❌ Erro geral:', err)
  } finally {
    await browser.close()
    await prisma.$disconnect()
  }
}

main()
