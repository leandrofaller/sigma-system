import fetch from 'node-fetch';
import * as cheerio from 'cheerio';
import * as fs from 'fs';
import * as path from 'path';

// Carrega .env manualmente
function loadEnv() {
  const envPath = path.resolve('f:\\relatorio_claude\\.env');
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf8');
    content.split('\n').forEach(line => {
      const parts = line.split('=');
      if (parts.length >= 2) {
        const key = parts[0].trim();
        const value = parts.slice(1).join('=').trim().replace(/^['"]|['"]$/g, '');
        process.env[key] = value;
      }
    });
  }
}

loadEnv();

function formatCpf(cpf: string): string {
  const clean = cpf.replace(/\D/g, '');
  if (clean.length === 11) {
    return `${clean.slice(0, 3)}.${clean.slice(3, 6)}.${clean.slice(6, 9)}-${clean.slice(9)}`;
  }
  return cpf;
}

async function run() {
  const rawUsername = process.env.SEJUS_SGP_USER || process.env.SIPE_CPF || '';
  const password = process.env.SEJUS_SGP_PASS || process.env.SIPE_SENHA || '';

  if (!rawUsername || !password) {
    console.error("ERRO: Credenciais não encontradas");
    return;
  }

  // Testa formatado
  const username = formatCpf(rawUsername);
  console.log(`Usando credenciais formatadas: ${username} / ${password.slice(0, 3)}***`);

  try {
    // 1. GET /login
    const getRes = await fetch("https://sgp.sejus.ro.gov.br/login", {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    const getCookies = getRes.headers.raw()['set-cookie'] || [];
    const cookieMap = new Map<string, string>();
    getCookies.forEach(cookieStr => {
      const parts = cookieStr.split(';')[0].split('=');
      if (parts.length >= 2) {
        cookieMap.set(parts[0].trim(), parts.slice(1).join('=').trim());
      }
    });

    const html = await getRes.text();
    const $ = cheerio.load(html);
    const token = $('input[name="_token"]').val();

    if (!token) {
      console.error("Não foi possível encontrar o token CSRF.");
      return;
    }

    const buildCookieHeader = () => {
      return Array.from(cookieMap.entries()).map(([k, v]) => `${k}=${v}`).join('; ');
    };

    // 2. POST /auth
    const bodyParams = new URLSearchParams();
    bodyParams.append('_token', String(token));
    bodyParams.append('cpf', username); // com pontos e traço!
    bodyParams.append('senha', password);

    const postRes = await fetch("https://sgp.sejus.ro.gov.br/auth", {
      method: "POST",
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Cookie': buildCookieHeader(),
        'Content-Type': 'application/x-www-form-urlencoded',
        'Referer': 'https://sgp.sejus.ro.gov.br/login',
        'Origin': 'https://sgp.sejus.ro.gov.br'
      },
      body: bodyParams.toString(),
      redirect: 'manual'
    });

    console.log("Status do POST /auth:", postRes.status);
    const location = postRes.headers.get('location');
    console.log("Redirecionamento para:", location);

    if (postRes.status === 302 && location) {
      const redirectRes = await fetch(location, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Cookie': buildCookieHeader()
        },
        redirect: 'manual'
      });

      console.log("Status do GET pós-login:", redirectRes.status);
      const nextLocation = redirectRes.headers.get('location');
      console.log("Próximo redirecionamento:", nextLocation);
    } else {
      console.log("Falha no login!");
    }
  } catch (err) {
    console.error("Erro no fluxo:", err);
  }
}

run();
