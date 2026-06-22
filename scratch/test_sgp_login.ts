import dotenv from 'dotenv';
import { join } from 'path';

dotenv.config({ path: join(process.cwd(), '.env') });

const pythonApiUrl = process.env.SIPE_PYTHON_API_URL || 'http://localhost:8000';
const rawUsername = process.env.SEJUS_SGP_USER || process.env.SIPE_CPF || '';
const password = process.env.SEJUS_SGP_PASS || process.env.SIPE_SENHA || '';

function formatCpf(cpf: string): string {
  const clean = cpf.replace(/\D/g, '');
  if (clean.length === 11) {
    return `${clean.slice(0, 3)}.${clean.slice(3, 6)}.${clean.slice(6, 9)}-${clean.slice(9)}`;
  }
  return cpf;
}

function cleanCpf(cpf: string): string {
  return cpf.replace(/\D/g, '');
}

async function requestSgpProxy(path: string, method: 'GET' | 'POST', form?: Record<string, string>, cookieHeader?: string) {
  const res = await fetch(`${pythonApiUrl}/sgp/proxy`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(cookieHeader ? { 'Cookie': cookieHeader } : {})
    },
    body: JSON.stringify({
      path,
      method,
      form
    })
  });

  if (!res.ok) {
    throw new Error(`Proxy error: ${res.status} ${res.statusText}`);
  }

  return await res.json();
}

async function testLogin(cpfToSend: string) {
  console.log(`\n--- Testando login com CPF: "${cpfToSend}" ---`);
  
  // 1. GET /login para pegar o CSRF token e cookies iniciais
  const loginPageData = await requestSgpProxy('/login', 'GET');
  const setCookies = loginPageData.set_cookies || [];
  
  // Constrói cabeçalho Cookie
  const cookiesMap = new Map<string, string>();
  setCookies.forEach((cookieStr: string) => {
    const parts = cookieStr.split(';')[0].split('=');
    if (parts.length >= 2) {
      cookiesMap.set(parts[0].trim(), parts.slice(1).join('=').trim());
    }
  });
  
  let cookieHeader = Array.from(cookiesMap.entries()).map(([k, v]) => `${k}=${v}`).join('; ');
  
  // Encontra o token
  const html = loginPageData.html || '';
  const tokenMatch = html.match(/name="_token" value="([^"]+)"/);
  if (!tokenMatch) {
    console.error('CSRF Token não encontrado!');
    return;
  }
  const token = tokenMatch[1];
  console.log('CSRF Token:', token);
  console.log('Cookies iniciais:', cookieHeader);

  // 2. POST /auth
  const form = {
    '_token': token,
    'cpf': cpfToSend,
    'senha': password
  };

  const authData = await requestSgpProxy('/auth', 'POST', form, cookieHeader);
  console.log('Status do POST /auth:', authData.status);
  console.log('URL de redirecionamento/URL final:', authData.url);
  console.log('Cookies retornados no auth:', authData.set_cookies);
  
  // Atualiza cookies
  const authCookies = authData.set_cookies || [];
  authCookies.forEach((cookieStr: string) => {
    const parts = cookieStr.split(';')[0].split('=');
    if (parts.length >= 2) {
      cookiesMap.set(parts[0].trim(), parts.slice(1).join('=').trim());
    }
  });
  cookieHeader = Array.from(cookiesMap.entries()).map(([k, v]) => `${k}=${v}`).join('; ');

  // Se redirecionou para /login ou continha aviso
  if (authData.status === 302) {
    const location = authData.headers?.location || authData.headers?.Location || '';
    console.log('Location de redirecionamento:', location);
    
    // Segue o redirecionamento
    const redirectData = await requestSgpProxy(location, 'GET', undefined, cookieHeader);
    const redirectHtml = redirectData.html || '';
    
    if (redirectHtml.includes('CPF não encontrado no SGP !!')) {
      console.log('Resultado: CPF não encontrado no SGP !!');
    } else if (redirectHtml.includes('Senha incorreta')) {
      console.log('Resultado: Senha incorreta!');
    } else {
      console.log('Resultado: Outra resposta. Tamanho do HTML:', redirectHtml.length);
      // Salva para inspeção
      const fs = require('fs');
      fs.writeFileSync(join(process.cwd(), `scratch/result_${cpfToSend.replace(/\D/g, '')}.html`), redirectHtml);
      console.log(`HTML salvo em scratch/result_${cpfToSend.replace(/\D/g, '')}.html`);
    }
  } else {
    const responseHtml = authData.html || '';
    if (responseHtml.includes('CPF não encontrado no SGP !!')) {
      console.log('Resultado (no próprio POST): CPF não encontrado no SGP !!');
    } else {
      console.log('Resultado: Status diferente de 302 sem redirecionamento.');
    }
  }
}

async function run() {
  if (!rawUsername) {
    console.error('Nenhum CPF configurado nas variáveis SIPE_CPF ou SEJUS_SGP_USER');
    return;
  }
  
  console.log(`CPF Configurado: ${rawUsername}`);
  console.log(`Senha Configurada: ${password ? '*****' : '(vazia)'}`);

  // Teste 1: CPF Formatado
  await testLogin(formatCpf(rawUsername));
  
  // Teste 2: CPF Limpo
  await testLogin(cleanCpf(rawUsername));
}

run().catch(console.error);
