const { chromium } = require('playwright');

async function main() {
  console.log('Iniciando monitoramento de cabeçalhos no CNA OAB...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });
  const page = await context.newPage();

  page.on('request', request => {
    const url = request.url();
    if (url.includes('/api/advogado/search')) {
      console.log(`[Request Search] URL: ${url}`);
      console.log('Headers:', JSON.stringify(request.headers(), null, 2));
    }
  });

  try {
    await page.goto('https://cna.oab.org.br/', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);

    await page.fill('input[name="registration"]', '3092');
    await page.selectOption('select[name="sectional"]', 'RO');
    await page.selectOption('select[name="registrationType"]', '1');

    console.log('Clicando em Pesquisar...');
    await page.click('button:has-text("Pesquisar")');

    await page.waitForTimeout(4000);

  } catch (err) {
    console.error('Erro na automação:', err);
  } finally {
    await browser.close();
  }
}

main();
