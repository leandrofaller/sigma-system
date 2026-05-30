const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// Função auxiliar para digitar como humano
async function typeAsHuman(page, selector, text) {
  await page.click(selector);
  for (const char of text) {
    await page.keyboard.type(char, { delay: 100 + Math.random() * 150 });
  }
}

async function main() {
  console.log('Iniciando pesquisa no CNA para OAB 3092/RO com simulação humana...');
  
  // Vamos rodar em modo HEADLESS mas com stealth adicional
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
    ]
  });

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 },
    locale: 'pt-BR',
    timezoneId: 'America/Porto_Velho'
  });

  // Remove o flag de automação
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });

  const page = await context.newPage();

  try {
    console.log('Acessando o site...');
    await page.goto('https://cna.oab.org.br/', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(1500 + Math.random() * 1000);

    // Foca e digita a inscrição com digitação realista
    console.log('Digitando inscrição 3092...');
    await typeAsHuman(page, 'input[name="registration"]', '3092');
    await page.waitForTimeout(500 + Math.random() * 500);

    // Seleciona a seccional
    console.log('Selecionando seccional RO...');
    await page.selectOption('select[name="sectional"]', 'RO');
    await page.waitForTimeout(600 + Math.random() * 500);

    // Seleciona tipo de inscrição
    console.log('Selecionando tipo de inscrição...');
    await page.selectOption('select[name="registrationType"]', '1');
    await page.waitForTimeout(700 + Math.random() * 500);

    // Clica em Pesquisar
    console.log('Clicando em Pesquisar...');
    await page.click('button:has-text("Pesquisar")');

    console.log('Aguardando resultados...');
    await page.waitForTimeout(6000);

    const bodyText = await page.innerText('body');
    const hasCaptcha = bodyText.includes('não é um robô') || bodyText.includes('desafio abaixo');
    console.log('Captcha detectado?', hasCaptcha);

    // Salvar o HTML
    const html = await page.content();
    fs.writeFileSync(path.join(__dirname, 'cna-result-stealth.html'), html);
    console.log('HTML salvo em scratch/cna-result-stealth.html');

    if (!hasCaptcha) {
      console.log('Sucesso! Buscando pelo nome Abdiel Afonso Figueira nos resultados...');
      
      // Procura o item correspondente ao resultado
      const resultFound = bodyText.includes('ABDIEL AFONSO FIGUEIRA') || bodyText.includes('Abdiel Afonso Figueira');
      console.log('Advogado encontrado nos resultados?', resultFound);

      // Listar elementos clicáveis de resultado
      const clickResult = await page.evaluate(async () => {
        // Encontra o item de resultado. Geralmente tem a classe ou texto contendo o nome do advogado
        const items = Array.from(document.querySelectorAll('*')).filter(el => {
          const text = el.textContent || '';
          return (text.includes('Abdiel') || text.includes('ABDIEL')) && 
                 el.tagName !== 'BODY' && el.tagName !== 'HTML' && el.tagName !== 'SCRIPT' && el.tagName !== 'STYLE';
        });
        if (items.length > 0) {
          // Acha o elemento folha
          let leaf = items[0];
          for (const item of items) {
            if (leaf.contains(item) && item !== leaf) {
              leaf = item;
            }
          }
          (leaf).click();
          return { success: true, text: leaf.textContent.trim().slice(0, 100), tag: leaf.tagName };
        }
        return { success: false };
      });
      console.log('Clique no resultado:', clickResult);

      if (clickResult.success) {
        await page.waitForTimeout(4000);
        
        // Salvar HTML de detalhes
        const detailsHtml = await page.content();
        fs.writeFileSync(path.join(__dirname, 'cna-details-stealth.html'), detailsHtml);
        console.log('HTML dos detalhes salvo em scratch/cna-details-stealth.html');

        // Extrair foto e dados
        const data = await page.evaluate(() => {
          const imgs = Array.from(document.querySelectorAll('img')).map(img => img.src);
          const text = document.body.innerText;
          return { imgs, text: text.slice(0, 3000) };
        });
        console.log('Imagens extraídas:', data.imgs);
        console.log('Texto extraído:\n', data.text.slice(0, 1500));
      }
    }
  } catch (err) {
    console.error('Erro:', err);
  } finally {
    await browser.close();
  }
}

main();
