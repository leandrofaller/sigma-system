import { chromium } from 'playwright';

async function main() {
  console.log('Testando preenchimento com eventos Angular no CNA OAB...');

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
    }
  });

  try {
    console.log('Acessando o CNA...');
    await page.goto('https://cna.oab.org.br/', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);

    console.log('Preenchendo campos com eventos do Angular...');
    await page.evaluate(() => {
      const regInput = document.querySelector('input[name="registration"]') as HTMLInputElement;
      if (regInput) {
        regInput.value = '3092';
        regInput.dispatchEvent(new Event('input', { bubbles: true }));
        regInput.dispatchEvent(new Event('change', { bubbles: true }));
      }

      const sectSelect = document.querySelector('select[name="sectional"]') as HTMLSelectElement;
      if (sectSelect) {
        sectSelect.value = 'RO';
        sectSelect.dispatchEvent(new Event('change', { bubbles: true }));
      }

      const typeSelect = document.querySelector('select[name="registrationType"]') as HTMLSelectElement;
      if (typeSelect) {
        typeSelect.value = '1';
        typeSelect.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });

    await page.waitForTimeout(500);

    console.log('Clicando em Pesquisar...');
    await page.click('button:has-text("Pesquisar")');

    console.log('Aguardando requisições...');
    await page.waitForTimeout(5000);

  } catch (err) {
    console.error('Erro:', err);
  } finally {
    await browser.close();
    console.log('Teste concluído.');
  }
}

main();
