const { chromium } = require('playwright');

async function main() {
  console.log('Iniciando o navegador para inspecionar https://cna.oab.org.br/...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });
  const page = await context.newPage();

  try {
    await page.goto('https://cna.oab.org.br/', { waitUntil: 'networkidle', timeout: 30000 });
    console.log('Página carregada. URL atual:', page.url());

    // Esperar um pouco para garantir que os scripts da página rodaram
    await page.waitForTimeout(2000);

    // Listar inputs de texto
    const inputs = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('input')).map(input => ({
        id: input.id,
        name: input.name,
        type: input.type,
        placeholder: input.placeholder,
        className: input.className
      }));
    });
    console.log('Inputs encontrados:', inputs);

    // Listar selects e suas opções
    const selects = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('select')).map(select => {
        const options = Array.from(select.options).map(opt => ({
          value: opt.value,
          text: opt.textContent ? opt.textContent.trim() : ''
        }));
        return {
          id: select.id,
          name: select.name,
          options
        };
      });
    });
    console.log('Selects encontrados:', JSON.stringify(selects, null, 2));

    // Tirar um print dos botões
    const buttons = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('button, input[type="button"], input[type="submit"]')).map(btn => ({
        text: btn.textContent ? btn.textContent.trim() : '',
        value: (btn).value || '',
        id: btn.id,
        className: btn.className
      }));
    });
    console.log('Botões encontrados:', buttons);

  } catch (err) {
    console.error('Erro durante a inspeção:', err);
  } finally {
    await browser.close();
  }
}

main();
