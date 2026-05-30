import { chromium } from 'playwright';
import { scrapeCnaOabDetails } from '../src/lib/sipe-scraper';

async function main() {
  console.log('Testando interceptação de rede CNA completo via scrapeCnaOabDetails...');

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
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 }
  });

  const page = await context.newPage();

  // Escuta de rede global no nível do contexto
  context.on('request', request => {
    const url = request.url();
    if (url.includes('oab.org.br') && !url.endsWith('.js') && !url.endsWith('.css') && !url.endsWith('.png') && !url.endsWith('.svg')) {
      console.log(`[NETWORK REQ] [${request.method()}] ${url}`);
    }
  });

  context.on('response', async response => {
    const url = response.url();
    if (url.includes('oab.org.br') && !url.endsWith('.js') && !url.endsWith('.css') && !url.endsWith('.png') && !url.endsWith('.svg')) {
      console.log(`[NETWORK RES] [${response.status()}] ${url}`);
      try {
        const text = await response.text();
        console.log(`  -> Resposta: ${text.slice(0, 300)}`);
      } catch (e: any) {
        console.log(`  -> Não pôde ler resposta: ${e.message}`);
      }
    }
  });

  try {
    // ID fictício para o teste
    await scrapeCnaOabDetails(page, 'teste-id-123', '3092/RO');
  } catch (err) {
    console.error('Erro disparado no scrape:', err);
  } finally {
    await browser.close();
    console.log('Teste concluído.');
  }
}

main();
