import fs from 'fs';
import * as cheerio from 'cheerio';

const SIPE_PYTHON_API_URL = process.env.SIPE_PYTHON_API_URL || 'http://localhost:8000';
const SIPE_UNIDADE = process.env.SIPE_UNIDADE || '3';

async function test() {
  const sipeId = 37894;
  const searchPath = `/apenados/index?escolha=nomeapenado&parametro=${sipeId}`;
  const url = `${SIPE_PYTHON_API_URL}/sipe/proxy?path=${encodeURIComponent(searchPath)}`;
  
  console.log('Buscando HTML de:', url);
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'X-Sipe-Unidade': SIPE_UNIDADE,
      }
    });
    
    if (!res.ok) {
      console.error('Erro na resposta do proxy:', res.status, res.statusText);
      return;
    }
    
    const data = await res.json();
    if (!data.html) {
      console.error('Resposta sem HTML:', data);
      return;
    }
    
    console.log('HTML recebido com sucesso. Salvando dump do HTML...');
    fs.writeFileSync('./scratch/search_result.html', data.html);
    
    const $ = cheerio.load(data.html);
    const table = $('table');
    if (!table.length) {
      console.log('Nenhuma tabela encontrada no HTML!');
      return;
    }
    
    console.log('\nTítulos do THEAD:');
    table.find('thead tr th, thead tr td').each((i, el) => {
      console.log(`Col ${i}: "${$(el).text().trim()}"`);
    });
    
    console.log('\nLinhas do TBODY:');
    table.find('tbody tr').each((rIdx, row) => {
      console.log(`\nLinha ${rIdx}:`);
      $(row).find('td').each((cIdx, td) => {
        const text = $(td).text().trim();
        const htmlContent = $(td).html()?.trim();
        console.log(`  Col ${cIdx}: Text="${text}" | HTML="${htmlContent?.substring(0, 150)}"`);
      });
    });
    
  } catch (err) {
    console.error('Erro ao executar requisição:', err);
  }
}

test();
