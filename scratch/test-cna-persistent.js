const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

async function main() {
  console.log('Iniciando teste de busca no CNA com launchPersistentContext e simulação humana...');
  
  const profileDir = path.join(__dirname, 'cna-profile-dir');
  if (!fs.existsSync(profileDir)) {
    fs.mkdirSync(profileDir, { recursive: true });
  }

  const browserContext = await chromium.launchPersistentContext(profileDir, {
    headless: true,
    ignoreDefaultArgs: ['--enable-automation'],
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream'
    ],
    viewport: { width: 1280, height: 800 },
    locale: 'pt-BR',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });

  const page = browserContext.pages()[0] || await browserContext.newPage();

  try {
    // Definir navigator.webdriver como undefined na inicialização da página
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });

    console.log('Acessando o CNA...');
    await page.goto('https://cna.oab.org.br/', { waitUntil: 'networkidle', timeout: 30000 });
    
    // Pequena movimentação de mouse aleatória
    console.log('Simulando interações humanas básicas (mouse)...');
    await page.mouse.move(100, 100);
    await page.waitForTimeout(500);
    await page.mouse.move(250, 180);
    await page.waitForTimeout(500);

    console.log('Preenchendo formulário de OAB...');
    // Focar no campo de inscrição e digitar caractere por caractere
    await page.focus('input[name="registration"]');
    await page.waitForTimeout(200);
    const num = '3092';
    for (const char of num) {
      await page.keyboard.press(char);
      await page.waitForTimeout(50 + Math.random() * 100);
    }
    await page.waitForTimeout(300);

    // Selecionar seccional
    await page.selectOption('select[name="sectional"]', 'RO');
    await page.waitForTimeout(400);

    // Selecionar tipo de inscrição
    await page.selectOption('select[name="registrationType"]', '1');
    await page.waitForTimeout(500);

    // Mover mouse até o botão de pesquisar e clicar de forma humana
    console.log('Clicando em Pesquisar...');
    const searchButton = page.locator('button:has-text("Pesquisar")');
    const box = await searchButton.boundingBox();
    if (box) {
      // Mover até o centro do botão
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 5 });
      await page.waitForTimeout(200);
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    } else {
      // Fallback
      await searchButton.click();
    }

    console.log('Aguardando resultados...');
    await page.waitForTimeout(6000);

    const bodyText = await page.innerText('body');
    const hasCaptcha = bodyText.includes('não é um robô') || bodyText.includes('desafio abaixo');
    console.log('Captcha detectado?', hasCaptcha);

    if (!hasCaptcha) {
      console.log('✅ Sucesso! O reCAPTCHA foi contornado com perfil persistente.');
      const resultFound = bodyText.includes('ABDIEL') || bodyText.includes('Abdiel');
      console.log('Abdiel encontrado nos resultados?', resultFound);
    } else {
      console.log('❌ O reCAPTCHA v3 ainda bloqueou com score baixo.');
    }

  } catch (err) {
    console.error('Erro:', err);
  } finally {
    await browserContext.close();
  }
}

main();
