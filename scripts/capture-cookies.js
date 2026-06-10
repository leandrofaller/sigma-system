const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const SIPE_URL = 'https://sipe.sejus.ro.gov.br';
const ENV_PATH = path.join(__dirname, '..', '.env');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const question = (query) => new Promise((resolve) => rl.question(query, resolve));

async function run() {
  console.log('\n==================================================');
  console.log('       SIPE COOKIES CAPTURE HELPER (Playwright)');
  console.log('==================================================\n');

  console.log('Iniciando navegador Chromium...');
  const browser = await chromium.launch({
    headless: false, // Abre o navegador visível para o usuário
    args: ['--disable-blink-features=AutomationControlled']
  });

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });

  const page = await context.newPage();
  console.log(`Navegando para: ${SIPE_URL}`);
  await page.goto(SIPE_URL);

  console.log('\n👉 INSTRUÇÕES:');
  console.log('1. Faça login no SIPE na janela do navegador que se abriu.');
  console.log('2. Selecione o seu Perfil e Unidade se o sistema solicitar.');
  console.log('3. Assim que você estiver visualizando o painel principal do SIPE (/home),');
  console.log('   retorne aqui a este terminal e pressione ENTER para capturar os cookies de sessão.');
  console.log('--------------------------------------------------');

  await question('Pressione [ENTER] quando estiver autenticado e na página inicial do SIPE...');

  console.log('\nCapturando cookies de sessão...');
  const cookies = await context.cookies();
  
  if (cookies.length === 0) {
    console.error('Erro: Nenhum cookie foi encontrado no contexto do navegador.');
    await browser.close();
    rl.close();
    return;
  }

  // Mapeia os cookies coletados
  const cookiesMap = {};
  const cookieParts = [];
  
  cookies.forEach(c => {
    cookiesMap[c.name] = c.value;
    cookieParts.append = `${c.name}=${c.value}`;
  });

  const laravelSession = cookiesMap['laravel_session_sipe'];
  const xsrfToken = cookiesMap['XSRF-TOKEN'];

  if (!laravelSession) {
    console.warn('⚠️ Alerta: O cookie "laravel_session_sipe" não foi encontrado. Certifique-se de ter feito o login com sucesso antes de pressionar Enter.');
  }

  // Monta a string consolidada de cookies
  const cookiesStr = cookies.map(c => `${c.name}=${c.value}`).join('; ');

  console.log('\nCookies detectados:');
  cookies.forEach(c => {
    const preview = c.value.length > 15 ? `${c.value.slice(0, 8)}...${c.value.slice(-8)}` : c.value;
    console.log(` - ${c.name}: ${preview} (Tamanho: ${c.value.length})`);
  });

  // Atualiza o arquivo .env
  if (!fs.existsSync(ENV_PATH)) {
    console.log(`Criando novo arquivo .env em: ${ENV_PATH}`);
    fs.writeFileSync(ENV_PATH, '', 'utf8');
  }

  let envContent = fs.readFileSync(ENV_PATH, 'utf8');

  // Função auxiliar para atualizar ou adicionar chaves no .env
  function updateEnvVar(key, value) {
    const regex = new RegExp(`^${key}=.*$`, 'm');
    if (regex.test(envContent)) {
      envContent = envContent.replace(regex, `${key}=${value}`);
    } else {
      // Garante uma nova linha se necessário
      if (envContent && !envContent.endsWith('\n')) {
        envContent += '\n';
      }
      envContent += `${key}=${value}\n`;
    }
  }

  // Limpa variáveis individuais antigas para evitar conflitos de cache
  const lines = envContent.split('\n');
  envContent = lines.filter(line => {
    const trimmed = line.trim();
    // Remove chaves antigas do F5 ASM e cookies individuais do SIPE
    return !(
      trimmed.startsWith('SIPE_COOKIE_') ||
      trimmed.startsWith('SIPE_COOKIES=')
    );
  }).join('\n');

  // Adiciona a string consolidada
  updateEnvVar('SIPE_COOKIES', `"${cookiesStr}"`);
  
  // Adiciona as chaves mapeadas individuais para manter compatibilidade
  if (laravelSession) {
    updateEnvVar('SIPE_COOKIE_LARAVEL_SESSION', laravelSession);
  }
  if (xsrfToken) {
    updateEnvVar('SIPE_COOKIE_XSRF_TOKEN', xsrfToken);
  }
  
  // Salva os cookies do F5 ASM (começam com TS01)
  cookies.forEach(c => {
    if (c.name.startsWith('TS01')) {
      updateEnvVar(`SIPE_COOKIE_${c.name}`, c.value);
    }
  });

  fs.writeFileSync(ENV_PATH, envContent, 'utf8');
  console.log('\n✅ Arquivo .env atualizado com sucesso com todos os cookies de sessão ativos!');
  console.log('As variáveis antigas de cookies foram limpas para evitar conflitos de cache.');

  console.log('\nFechando navegador...');
  await browser.close();
  rl.close();
  
  console.log('\n👉 DICA: Agora reinicie o seu servidor Uvicorn (Ctrl+C e suba de novo) e teste a rota de busca!');
}

run().catch(err => {
  console.error('Erro na execução do script:', err);
  rl.close();
});
