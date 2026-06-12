const fs = require('fs');
const cheerio = require('cheerio');

async function main() {
  try {
    console.log('Obtendo página /selectRole via proxy...');
    const res = await fetch(`http://localhost:8000/sipe/proxy?path=${encodeURIComponent('/selectRole')}`, {
      headers: {
        'Accept': 'application/json',
        'X-Sipe-Unidade': '23'
      }
    });
    
    if (!res.ok) {
      console.error('Falha no GET /selectRole:', res.status);
      return;
    }
    
    const data = await res.json();
    const html = data.html || '';
    
    const $ = cheerio.load(html);
    
    console.log('\n--- PERFIS DISPONÍVEIS (app_role_id) ---');
    $('select[name="app_role_id"] option, select#app_role_id option').each((i, el) => {
      console.log(`Value: "${$(el).attr('value')}" - Text: "${$(el).text().trim()}"`);
    });
    
    console.log('\n--- UNIDADES DISPONÍVEIS (unidade_id) ---');
    $('select[name="unidade_id"] option, select#unidade_id option').each((i, el) => {
      console.log(`Value: "${$(el).attr('value')}" - Text: "${$(el).text().trim()}"`);
    });
    
    if ($('select[name="unidade_id"]').length === 0) {
      console.log('Nenhum dropdown de unidades encontrado. Vamos analisar as options soltas:');
      $('option').each((i, el) => {
        console.log(`Option ${i}: value="${$(el).attr('value')}" text="${$(el).text().trim()}"`);
      });
    }
    
  } catch (err) {
    console.error('Erro:', err);
  }
}

main();
