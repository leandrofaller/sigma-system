import { chromium } from 'playwright'
import fs from 'fs'
import path from 'path'
import { PrismaClient } from '@prisma/client'

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
const SIPE_UNIDADE = '18' // Unidade de Nova Mamoré

const prisma = new PrismaClient()

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

async function inspectAdvogado() {
  console.log('🚀 Buscando um advogado existente no banco local...')
  const adv = await prisma.sipeAdvogado.findFirst({
    orderBy: { createdAt: 'desc' }
  })
  
  if (!adv) {
    console.error('❌ Nenhum advogado encontrado no banco local para testar!')
    return
  }
  
  console.log(`Advogado selecionado: ID SIPE = ${adv.sipeId} | Nome = ${adv.nome}`)
  
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  })
  const page = await context.newPage()

  try {
    const logado = await login(page, SIPE_UNIDADE)
    if (!logado) throw new Error('Falha no login')
    
    const url = `${SIPE_URL}/advogados/${adv.sipeId}/detalhaclientes`
    console.log(`Navegando para: ${url}`)
    await page.goto(url, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('body', { timeout: 10_000 })
    
    console.log('Extraindo todas as imagens da página...')
    const images = await page.evaluate(() => {
      const imgs = Array.from(document.querySelectorAll('img'))
      return imgs.map(img => ({
        src: img.src,
        className: img.className,
        id: img.id,
        alt: img.alt,
        parentId: img.parentElement?.id || '',
        parentClass: img.parentElement?.className || '',
        tagName: img.tagName
      }))
    })
    
    console.log(`\nImagens encontradas (${images.length}):`)
    images.forEach((img, i) => {
      console.log(`[Imagem ${i + 1}]`)
      console.log(`  src: ${img.src}`)
      console.log(`  class: ${img.className}`)
      console.log(`  id: ${img.id}`)
      console.log(`  alt: ${img.alt}`)
      console.log(`  parent: <${img.tagName} class="${img.parentClass}" id="${img.parentId}">`)
    })
    
    // Salvar o HTML para inspeção profunda se necessário
    const html = await page.content()
    fs.writeFileSync('scratch/advogado-detalhe.html', html)
    console.log('\nHTML completo salvo em scratch/advogado-detalhe.html')
    
  } catch (err: any) {
    console.error('❌ Erro no teste:', err)
  } finally {
    await browser.close()
    await prisma.$disconnect()
  }
}

inspectAdvogado()
