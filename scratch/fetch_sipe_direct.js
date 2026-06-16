import fs from 'fs';
import dotenv from 'dotenv';
import * as cheerio from 'cheerio';
dotenv.config();

const SIPE_URL = 'https://sipe.sejus.ro.gov.br';
const SIPE_COOKIES = process.env.SIPE_COOKIES || '';

async function test() {
  const sipeId = 77624;
  const searchPath = `/apenados/index?escolha=nomeapenado&parametro=${sipeId}`;
  const url = `${SIPE_URL}${searchPath}`;
  
  console.log('Buscando HTML diretamente do SIPE com cookies...');
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'Cookie': SIPE_COOKIES,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      }
    });
    
    if (!res.ok) {
      console.error('Erro na resposta do SIPE:', res.status, res.statusText);
      return;
    }
    
    const html = await res.text();
    fs.writeFileSync('./scratch/manoel_search.html', html);
    console.log('HTML da listagem salvo em scratch/manoel_search.html');
    
    const $ = cheerio.load(html);
    const table = $('table');
    if (!table.length) {
      console.log('Nenhuma tabela encontrada no HTML!');
      if (html.includes('/login') || html.includes('login-box')) {
        console.log('Sessão expirada ou cookies inválidos/vencidos!');
      } else {
        console.log('Estrutura da página:', html.substring(0, 500));
      }
      return;
    }
    
    console.log('\nTítulos do THEAD:');
    table.find('thead tr th, table thead tr td').each((i, el) => {
      console.log(`Col ${i}: "${$(el).text().trim()}"`);
    });
    
    console.log('\nLinhas do TBODY:');
    table.find('tbody tr').each((rIdx, row) => {
      console.log(`\nLinha ${rIdx}:`);
      $(row).find('td').each((cIdx, td) => {
        const text = $(td).text().trim();
        const innerHtml = $(td).html()?.trim();
        console.log(`  Col ${cIdx}: Text="${text}" | HTML="${innerHtml?.substring(0, 150)}"`);
      });
    });
    
  } catch (err) {
    console.error('Erro ao executar requisição:', err);
  }
}

test();
