const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

async function main() {
  console.log('Testando busca no CNA com flags avançadas de stealth (ignoreDefaultArgs)...');
  
  const browser = await chromium.launch({
    headless: true,
    ignoreDefaultArgs: ['--enable-automation'], // Desativa o flag padrão de automação do Playwright
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled', // Oculta a flag de automação interna do Blink
    ]
  });

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 },
    locale: 'pt-BR'
  });

  const page = await context.newPage();

  try {
    console.log('Acessando o CNA...');
    await page.goto('https://cna.oab.org.br/', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);

    console.log('Preenchendo formulário...');
    await page.fill('input[name="registration"]', '3092');
    await page.selectOption('select[name="sectional"]', 'RO');
    await page.selectOption('select[name="registrationType"]', '1');
    await page.waitForTimeout(1000);

    console.log('Clicando em Pesquisar...');
    await page.click('button:has-text("Pesquisar")');

    console.log('Aguardando resultados...');
    await page.waitForTimeout(6000);

    const bodyText = await page.innerText('body');
    const hasCaptcha = bodyText.includes('não é um robô') || bodyText.includes('desafio abaixo');
    console.log('Captcha detectado?', hasCaptcha);

    if (!hasCaptcha) {
      console.log('✅ Sucesso! O reCAPTCHA foi contornado com as flags avançadas.');
      const resultFound = bodyText.includes('ABDIEL') || bodyText.includes('Abdiel');
      console.log('Abdiel encontrado nos resultados?', resultFound);
    } else {
      console.log('❌ O reCAPTCHA v3 ainda bloqueou com score baixo.');
    }

  } catch (err) {
    console.error('Erro:', err);
  } finally {
    await browser.close();
  }
}

main();
