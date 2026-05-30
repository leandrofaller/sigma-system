const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

async function main() {
  console.log('Iniciando busca debug no CNA para ver por que retornou não encontrado...');
  
  const browser = await chromium.launch({
    headless: true,
    ignoreDefaultArgs: ['--enable-automation'],
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
    ]
  });

  const context = await browser.newContext({
    locale: 'pt-BR',
    timezoneId: 'America/Porto_Velho',
  });

  const page = await context.newPage();

  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });

  try {
    console.log('Acessando o CNA...');
    await page.goto('https://cna.oab.org.br/', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);

    console.log('Preenchendo formulário para OAB 3092 / RO...');
    await page.fill('input[name="registration"]', '3092');
    await page.selectOption('select[name="sectional"]', 'RO');
    await page.selectOption('select[name="registrationType"]', '1');
    await page.waitForTimeout(500);

    console.log('Clicando em Pesquisar...');
    await page.click('button:has-text("Pesquisar")');

    // Esperar adaptativo (mesma lógica)
    console.log('Aguardando resultados...');
    let hasCaptcha = false;
    for (let i = 0; i < 8; i++) {
      await page.waitForTimeout(500);
      const bodyText = await page.innerText('body');
      hasCaptcha = bodyText.includes('não é um robô') || 
                   bodyText.includes('desafio abaixo') || 
                   bodyText.includes('Resolva o desafio') || 
                   bodyText.includes('Confirme que você');
      
      if (hasCaptcha) break;
      
      const resultsFound = await page.evaluate(() => {
        return document.body.innerText.includes('Nenhum resultado encontrado') || 
               document.querySelectorAll('app-cna li button').length > 0 || 
               document.body.innerText.includes('Resultado');
      });
      if (resultsFound) break;
    }

    console.log('Captcha detectado?', hasCaptcha);

    // Salvar o HTML do resultado para podermos ver o que apareceu na página
    const html = await page.content();
    fs.writeFileSync(path.join(__dirname, 'cna-result-debug.html'), html);
    console.log('HTML do resultado salvo em scratch/cna-result-debug.html');

    const innerText = await page.innerText('body');
    console.log('Texto parcial da página (primeiros 1000 chars):');
    console.log(innerText.slice(0, 1000));

    console.log('--- FIM DO TEXTO ---');

  } catch (err) {
    console.error('Erro:', err);
  } finally {
    await browser.close();
  }
}

main();
