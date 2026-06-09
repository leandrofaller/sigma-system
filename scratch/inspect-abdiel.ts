import { chromium } from 'playwright'
import fs from 'fs'
import path from 'path'

// Parse manual de .env
if (fs.existsSync('.env')) {
  const envContent = fs.readFileSync('.env', 'utf-8')
  for (const line of envContent.split('\n')) {
    const parts = line.split('=')
    if (parts.length >= 2) {
      const key = parts[0].trim()
      const val = parts.slice(1).join('=').trim().replace(/^['"]|['"]$/g, '')
      process.env[key] = val
    }
  }
}

const SIPE_URL = 'https://sipe.sejus.ro.gov.br'
const SIPE_CPF = process.env.SIPE_CPF ?? ''
const SIPE_SENHA = process.env.SIPE_SENHA ?? ''
const SIPE_PERFIL = process.env.SIPE_PERFIL ?? '2'
const SIPE_UNIDADE = '3' // CDPPVH

async function login(page: any, unidadeId: string) {
  await page.goto(`${SIPE_URL}/`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await page.waitForSelector('input[type="password"]', { timeout: 30_000 })

  const cpfInput =
    (await page.$('input[placeholder*="CPF"]')) ??
    (await page.$('input[name*="cpf"], input[name*="login"], input[type="text"]'))
  if (!cpfInput) {
    throw new Error(`Campo CPF não encontrado na página de login. URL atual: ${page.url()}`)
  }

  await cpfInput.fill(SIPE_CPF)
  await page.fill('input[type="password"]', SIPE_SENHA)

  const submitBtn =
    (await page.$('button[type="submit"]')) ??
    (await page.$('input[type="submit"]')) ??
    (await page.$('button'))
  if (!submitBtn) throw new Error('Botão de submit não encontrado na página de login')
  await submitBtn.click()

  try {
    await page.waitForURL('**/selectRole**', { timeout: 30_000 })
  } catch {
    const url = page.url()
    const bodyText = await page.innerText('body').catch(() => '')
    const errorMsg = bodyText.slice(0, 300).replace(/\s+/g, ' ').trim()
    throw new Error(
      `Login não redirecionou para /selectRole. URL atual: ${url}` +
      (errorMsg ? ` | Página: ${errorMsg}` : '')
    )
  }

  await page.locator('select').nth(0).waitFor({ state: 'attached', timeout: 10_000 })
  await page.locator('select').nth(1).waitFor({ state: 'attached', timeout: 10_000 })

  await page.evaluate((perfil) => {
    const selects = document.querySelectorAll('select')
    const selectPerfil = selects[0] as HTMLSelectElement
    if (selectPerfil) {
      selectPerfil.value = perfil
      selectPerfil.dispatchEvent(new Event('change', { bubbles: true }))
    }
  }, SIPE_PERFIL)

  try {
    await page.waitForFunction((unidade) => {
      const selects = document.querySelectorAll('select')
      const selectUnidade = selects[1] as HTMLSelectElement
      if (!selectUnidade) return false
      const options = Array.from(selectUnidade.options)
      return options.some(opt => opt.value === unidade)
    }, unidadeId, { timeout: 15_000 })
  } catch (err) {}

  await page.evaluate((unidade) => {
    const selects = document.querySelectorAll('select')
    const selectUnidade = selects[1] as HTMLSelectElement
    if (selectUnidade) {
      selectUnidade.value = unidade
      selectUnidade.dispatchEvent(new Event('change', { bubbles: true }))
    }
  }, unidadeId)

  await page.waitForTimeout(500)

  const submitBtn2 =
    (await page.$('button[type="submit"]')) ??
    (await page.$('input[type="submit"]')) ??
    (await page.$('button'))
  if (!submitBtn2) throw new Error('Botão de submit não encontrado na página selectRole')
  await submitBtn2.click()

  try {
    if (!page.url().includes('/home')) {
      await page.waitForURL('**/home**', { timeout: 30_000 })
    }
  } catch {
    const url = page.url()
    if (!url.includes('/home')) {
      throw new Error(`Seleção de perfil não redirecionou para /home. URL atual: ${url}`)
    }
  }

  return true
}

async function inspectAbdiel() {
  const sipeId = 559 // Abdiel Afonso Figueira
  console.log(`🚀 Fazendo login para inspecionar Abdiel (ID SIPE = ${sipeId})...`)
  
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  })
  const page = await context.newPage()

  try {
    const logado = await login(page, SIPE_UNIDADE)
    if (!logado) throw new Error('Falha no login')
    
    const url = `${SIPE_URL}/advogados/${sipeId}/detalhaclientes`
    console.log(`Navegando para: ${url}`)
    await page.goto(url, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('body', { timeout: 10_000 })
    
    console.log('Extraindo informações do advogado...');
    const dadosAdv = await page.evaluate(`(function() {
      var rows = Array.from(document.querySelectorAll('.profile-user-info-striped .profile-info-row'));
      var getVal = function(name) {
        var row = rows.find(function(r) {
          var nameEl = r.querySelector('.profile-info-name');
          return nameEl && nameEl.textContent.toLowerCase().indexOf(name.toLowerCase()) !== -1;
        });
        if (row) {
          var valEl = row.querySelector('.profile-info-value');
          return valEl ? valEl.textContent.trim() : '';
        }
        return '';
      };

      var img = document.querySelector('.profile-picture img');
      var fotoSrc = img ? img.src : null;
      var containerFotoHtml = document.querySelector('.profile-picture') ? document.querySelector('.profile-picture').innerHTML : 'não encontrado';

      return {
        nome: getVal('Nome do Advogado'),
        oab: getVal('OAB'),
        fotoSrc: fotoSrc,
        containerFotoHtml: containerFotoHtml
      };
    })()`) as any;

    console.log('\n--- Dados do Advogado Extraídos ---');
    console.log(JSON.stringify(dadosAdv, null, 2));

    const html = await page.content()
    fs.writeFileSync('scratch/abdiel-detalhe.html', html)
    console.log('\nHTML completo de Abdiel salvo em scratch/abdiel-detalhe.html')
    
  } catch (err: any) {
    console.error('❌ Erro no teste:', err)
  } finally {
    await browser.close()
  }
}

inspectAbdiel()
