import { requestSipeViaProxy } from '../src/lib/sipe-scraper';
import * as dotenv from 'dotenv';
import { writeFileSync } from 'fs';
import { join } from 'path';

dotenv.config();

async function main() {
  (globalThis as any).__sipeCurrentEngine = 'python-sdk';
  
  console.log('Fazendo requisição para /visitas/apenadosporvisita...');
  const res = await requestSipeViaProxy({
    path: '/visitas/apenadosporvisita',
    method: 'GET',
    headers: {
      'X-Sipe-Perfil': 'visitas-entradas',
    },
  });

  if (!res) {
    console.error('Nenhum resultado retornado do proxy.');
    return;
  }

  const html = res.html || res.text || '';
  const outPath = join(__dirname, 'visitas.html');
  writeFileSync(outPath, html, 'utf8');
  console.log(`HTML gravado com sucesso em: ${outPath}. Tamanho: ${html.length} bytes.`);
}

main().catch(console.error);
