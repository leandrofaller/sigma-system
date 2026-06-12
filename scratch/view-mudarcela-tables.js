const fs = require('fs');
const cheerio = require('cheerio');

const html = fs.readFileSync('scratch/mudarcela-31417.html', 'utf8');
const $ = cheerio.load(html);

console.log('--- BUSCANDO TODAS AS TABELAS NO HTML ---');
$('table').each((i, table) => {
  console.log(`\nTabela ${i}:`);
  
  const headers = [];
  $(table).find('thead tr th, thead tr td, tr:first-child th, tr:first-child td').each((_, el) => {
    headers.push($(el).text().trim().replace(/\s+/g, ' '));
  });
  console.log('Headers:', headers);
  
  const rows = $(table).find('tbody tr, tr');
  console.log(`Total de linhas: ${rows.length}`);
  
  // Imprime as duas primeiras linhas de dados
  for (let j = 0; j < Math.min(rows.length, 3); j++) {
    const cells = $(rows[j]).find('td');
    if (cells.length > 0) {
      const cellTexts = cells.map((_, el) => $(el).text().trim().replace(/\s+/g, ' ')).get();
      console.log(`  Linha ${j}:`, cellTexts);
    }
  }
});
