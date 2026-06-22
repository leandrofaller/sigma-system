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

async function run() {
  const username = process.env.SEJUS_SGP_USER || process.env.SIPE_CPF || '';
  const password = process.env.SEJUS_SGP_PASS || process.env.SIPE_SENHA || '';

  if (!username || !password) {
    console.error("ERRO: Credenciais não encontradas");
    return;
  }

  console.log(`Usando credenciais: ${username} / ${password.slice(0, 3)}***`);

  try {
    // 1. GET /login
    console.log("\n--- PASSO 1: GET /login ---");
    const getRes = await fetch("https://sgp.sejus.ro.gov.br/login", {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    const getCookies = getRes.headers.raw()['set-cookie'] || [];
    console.log("Cookies do GET:", getCookies);

    // Parse cookies
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
    console.log("Token CSRF encontrado:", token);

    if (!token) {
      console.error("Não foi possível encontrar o token CSRF.");
      return;
    }

    // Preparar cookies para enviar
    const buildCookieHeader = () => {
      return Array.from(cookieMap.entries()).map(([k, v]) => `${k}=${v}`).join('; ');
    };

    // 2. POST /auth
    console.log("\n--- PASSO 2: POST /auth ---");
    const bodyParams = new URLSearchParams();
    bodyParams.append('_token', String(token));
    bodyParams.append('cpf', username);
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
    console.log("Headers do POST:", Object.fromEntries(postRes.headers.entries()));
    
    const postCookies = postRes.headers.raw()['set-cookie'] || [];
    console.log("Novos cookies do POST:", postCookies);

    postCookies.forEach(cookieStr => {
      const parts = cookieStr.split(';')[0].split('=');
      if (parts.length >= 2) {
        cookieMap.set(parts[0].trim(), parts.slice(1).join('=').trim());
      }
    });

    const location = postRes.headers.get('location');
    console.log("Redirecionamento para:", location);

    if (postRes.status === 302 && location) {
      // 3. GET para o redirecionamento
      console.log(`\n--- PASSO 3: GET para ${location} ---`);
      const redirectRes = await fetch(location, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Cookie': buildCookieHeader(),
          'Referer': 'https://sgp.sejus.ro.gov.br/login'
        },
        redirect: 'manual'
      });

      console.log("Status do GET pós-login:", redirectRes.status);
      console.log("Headers pós-login:", Object.fromEntries(redirectRes.headers.entries()));
      const nextLocation = redirectRes.headers.get('location');
      console.log("Proximo redirecionamento para:", nextLocation);

      const redirectCookies = redirectRes.headers.raw()['set-cookie'] || [];
      console.log("Novos cookies pós-login:", redirectCookies);
      redirectCookies.forEach(cookieStr => {
        const parts = cookieStr.split(';')[0].split('=');
        if (parts.length >= 2) {
          cookieMap.set(parts[0].trim(), parts.slice(1).join('=').trim());
        }
      });

      const redirectHtml = await redirectRes.text();
      fs.writeFileSync('scratch/redirect_result.html', redirectHtml);
      
      // Se redirecionou de novo, vamos seguir
      let targetUrl = nextLocation || location;
      if (targetUrl) {
        const nextRes = await fetch(targetUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Cookie': buildCookieHeader()
          }
        });
        const nextHtml = await nextRes.text();
        fs.writeFileSync('scratch/next_result.html', nextHtml);
        console.log(`Conteúdo do próximo redirect (${targetUrl}) salvo.`);
        
        const $next = cheerio.load(nextHtml);
        console.log("Links encontrados na página:");
        $next('a').each((i, el) => {
          const href = $next(el).attr('href');
          const text = $next(el).text().trim();
          console.log(`  Link: href="${href}" text="${text}"`);
        });

        // Procurando select
        const select = $next('select');
        if (select.length > 0) {
          console.log("Select encontrado!");
          select.find('option').each((i, opt) => {
            console.log(`  Option: value="${$next(opt).val()}" text="${$next(opt).text().trim()}"`);
          });
        }
      }
    } else {
      console.log("POST /auth não retornou redirecionamento 302.");
      const text = await postRes.text();
      console.log("HTML retornado pelo POST:", text.slice(0, 1000));
    }
  } catch (err) {
    console.error("Erro no fluxo:", err);
  }
}

run();
