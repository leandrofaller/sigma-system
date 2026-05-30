import { chromium } from 'playwright'

async function debugCaptcha() {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()

  try {
    await page.goto('https://cna.oab.org.br/', { waitUntil: 'load' })
    await page.waitForTimeout(2000)
    
    // Preenche e submete
    const oabInput = await page.$('input[placeholder*="OAB"], input[name*="oab"], input[type="text"]')
    if (oabInput) await oabInput.fill('234A')
    
    const button = await page.$('button:has-text("Pesquisar"), button:has-text("pesquisar")')
    if (button) await button.click()
    
    await page.waitForTimeout(5000)

    // Procura na página renderizada
    const info = await page.evaluate(() => {
      const w = window as any
      const result: any = {}
      
      // Procura badge
      const badge = document.querySelector('.grecaptcha-badge')
      result.badgeFound = !!badge
      
      // Procura iframe do reCAPTCHA
      const iframe = document.querySelector('iframe[name*="captcha"], iframe[src*="recaptcha"]')
      result.iframeFound = !!iframe
      if (iframe) {
        result.iframeAttrs = {
          name: iframe.getAttribute('name'),
          src: iframe.getAttribute('src'),
          'data-sitekey': iframe.getAttribute('data-sitekey')
        }
      }
      
      // Procura em parent do iframe
      const captchaContainer = document.querySelector('[data-sitekey], [data-captcha-key]')
      if (captchaContainer) {
        result.containerAttrs = Array.from(captchaContainer.attributes).reduce((acc: any, attr: any) => {
          acc[attr.name] = attr.value
          return acc
        }, {})
      }
      
      // Procura script com chave
      const scripts = Array.from(document.querySelectorAll('script'))
      for (const script of scripts) {
        const text = script.textContent || ''
        if (text.includes('sitekey') || text.includes('grecaptcha.render')) {
          result.scriptWithKey = text.substring(0, 200)
          break
        }
      }
      
      return result
    })
    
    console.log('🔍 Resultado da busca:')
    console.log(JSON.stringify(info, null, 2))

    // Tenta extrair a chave do HTML completo
    const content = await page.content()
    const sitekeyMatch = content.match(/data-sitekey="([^"]+)"/i)
    if (sitekeyMatch) {
      console.log(`\n✅ CHAVE ENCONTRADA NO HTML: ${sitekeyMatch[1]}`)
    }
    
    // Procura por padrão "sitekey":"..."
    const jsonMatch = content.match(/"sitekey":"([^"]+)"/i)
    if (jsonMatch) {
      console.log(`✅ CHAVE EM JSON: ${jsonMatch[1]}`)
    }

  } catch (error) {
    console.error('Erro:', error)
  } finally {
    await browser.close()
  }
}

debugCaptcha()
