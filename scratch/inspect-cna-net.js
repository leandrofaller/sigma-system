const { chromium } = require('playwright');

async function main() {
  console.log('Iniciando monitoramento de rede no CNA OAB...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });
  const page = await context.newPage();

  // Monitorar requisições
  page.on('request', request => {
    const url = request.url();
    if (url.includes('oab.org.br') && !url.endsWith('.js') && !url.endsWith('.css') && !url.endsWith('.png') && !url.endsWith('.svg')) {
      console.log(`[Request] [${request.method()}] ${url}`);
      const postData = request.postData();
      if (postData) {
        console.log(`  -> Payload: ${postData.slice(0, 1000)}`);
      }
    }
  });

  // Monitorar respostas
  page.on('response', async response => {
    const url = response.url();
    if (url.includes('oab.org.br') && !url.endsWith('.js') && !url.endsWith('.css') && !url.endsWith('.png') && !url.endsWith('.svg')) {
      console.log(`[Response] [${response.status()}] ${url}`);
      try {
        const text = await response.text();
        console.log(`  -> Resposta: ${text.slice(0, 1000)}`);
      } catch (e) {
        console.log(`  -> Não pôde ler o corpo da resposta: ${e.message}`);
      }
    }
  });

  try {
    await page.goto('https://cna.oab.org.br/', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);

    // Preenche inscrição e seccional
    await page.fill('input[name="registration"]', '3092');
    await page.selectOption('select[name="sectional"]', 'RO');
    await page.selectOption('select[name="registrationType"]', '1');

    // Clica em pesquisar
    console.log('Clicando em Pesquisar...');
    await page.click('button:has-text("Pesquisar")');

    // Aguardar requisições de busca disparadas
    await page.waitForTimeout(5000);

  } catch (err) {
    console.error('Erro na automação:', err);
  } finally {
    await browser.close();
  }
}

main();
