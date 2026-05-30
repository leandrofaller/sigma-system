const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const os = require('os');

function findWindowsChrome() {
  const paths = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    path.join(os.homedir(), 'AppData\\Local\\Google\\Chrome\\Application\\chrome.exe')
  ];
  return paths.find(fs.existsSync);
}

async function main() {
  const chromePath = findWindowsChrome();
  if (!chromePath) {
    console.error('Google Chrome oficial não foi encontrado no sistema.');
    return;
  }
  console.log(`Usando Google Chrome oficial encontrado em: ${chromePath} (HEADFUL MODE)`);

  const browser = await chromium.launch({
    executablePath: chromePath,
    headless: false, // Modo headful!
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
    ]
  });

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 },
    locale: 'pt-BR'
  });

  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });

  const page = await context.newPage();

  try {
    console.log('Acessando o site...');
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
    await page.waitForTimeout(8000);

    const bodyText = await page.innerText('body');
    const hasCaptcha = bodyText.includes('não é um robô') || bodyText.includes('desafio abaixo');
    console.log('Captcha detectado?', hasCaptcha);

    const html = await page.content();
    fs.writeFileSync(path.join(__dirname, 'cna-result-chrome-headful.html'), html);
    console.log('HTML salvo em scratch/cna-result-chrome-headful.html');

    if (!hasCaptcha) {
      const resultFound = bodyText.includes('ABDIEL') || bodyText.includes('Abdiel');
      console.log('Abdiel encontrado nos resultados?', resultFound);
      
      // Tentar clicar no resultado
      const clicked = await page.evaluate(() => {
        const items = Array.from(document.querySelectorAll('*')).filter(el => {
          const text = el.textContent || '';
          return (text.includes('Abdiel') || text.includes('ABDIEL')) && 
                 el.tagName !== 'BODY' && el.tagName !== 'HTML' && el.tagName !== 'SCRIPT' && el.tagName !== 'STYLE';
        });
        if (items.length > 0) {
          let leaf = items[0];
          for (const item of items) {
            if (leaf.contains(item) && item !== leaf) {
              leaf = item;
            }
          }
          (leaf).click();
          return { success: true, text: leaf.textContent.trim().slice(0, 100) };
        }
        return { success: false };
      });
      console.log('Clique no resultado:', clicked);
      
      await page.waitForTimeout(4000);
      const detailsHtml = await page.content();
      fs.writeFileSync(path.join(__dirname, 'cna-details-chrome-headful.html'), detailsHtml);
      
      const data = await page.evaluate(() => {
        const img = document.querySelector('app-cna-profile img, .profile img, img') ;
        const src = img ? (img).src : '';
        const text = document.body.innerText;
        return { src, text };
      });
      console.log('Foto encontrada:', data.src);
      console.log('Texto do perfil:\n', data.text.slice(0, 1000));
    }
  } catch (err) {
    console.error('Erro na pesquisa:', err);
  } finally {
    await browser.close();
  }
}

main();
