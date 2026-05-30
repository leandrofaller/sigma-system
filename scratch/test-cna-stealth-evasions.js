const { chromium } = require('playwright');

async function main() {
  console.log('Iniciando teste de busca no CNA com evasões avançadas de fingerprint...');
  
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
    // Não definir userAgent estático para que o browser use o natural dele
  });

  const page = await context.newPage();

  // Injetar evasões stealth avançadas no carregamento da página
  await page.addInitScript(() => {
    // 1. Remover webdriver
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });

    // 2. Mock chrome object (comum em navegadores headful, ausente em headless)
    window.chrome = {
      app: {
        isInstalled: false,
        InstallState: { DISABLED: 'disabled', INSTALLED: 'installed', NOT_INSTALLED: 'not_installed' },
        RunningState: { CANNOT_RUN: 'cannot_run', RUNNING: 'running', CAN_RUN: 'can_run' }
      },
      runtime: {
        OnInstalledReason: { INSTALL: 'install', UPDATE: 'update', CHROME_UPDATE: 'chrome_update', SHARED_MODULE_UPDATE: 'shared_module_update' },
        OnRestartRequiredReason: { APP_UPDATE: 'app_update', OS_UPDATE: 'os_update', PERIODIC: 'periodic' },
        PlatformArch: { ARM: 'arm', ARM64: 'arm64', X86_32: 'x86-32', X86_64: 'x86-64', MIPS: 'mips', MIPS64: 'mips64' },
        PlatformNaclArch: { ARM: 'arm', X86_32: 'x86-32', X86_64: 'x86-64' },
        PlatformOs: { MAC: 'mac', WIN: 'win', ANDROID: 'android', CROS: 'cros', LINUX: 'linux', OPENBSD: 'openbsd' },
        RequestUpdateCheckStatus: { THROTTLED: 'throttled', NO_UPDATE: 'no_update', UPDATE_AVAILABLE: 'update_available' }
      }
    };

    // 3. Sobrescrever languages se necessário
    Object.defineProperty(navigator, 'languages', { get: () => ['pt-BR', 'pt', 'en-US', 'en'] });

    // 4. Evasão de Plugins
    Object.defineProperty(navigator, 'plugins', {
      get: () => {
        const mockPlugins = [
          { name: 'PDF Viewer', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
          { name: 'Chrome PDF Viewer', filename: 'mhjfbgojcjbhgocagamgkBafjoljbhga', description: 'Portable Document Format' }
        ];
        return mockPlugins;
      }
    });
  });

  try {
    console.log('Acessando o CNA...');
    await page.goto('https://cna.oab.org.br/', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);

    // Preencher formulário de OAB
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
      console.log('✅ Sucesso! O reCAPTCHA foi contornado com evasões avançadas.');
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
