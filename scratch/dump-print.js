const fs = require('fs');
const cheerio = require('cheerio');

const html = fs.readFileSync('scratch/mudarcela-31417.html', 'utf8');
const $ = cheerio.load(html);

console.log('--- BUSCANDO TODOS OS BOTÕES E LINKS DE IMPRESSÃO ---');
$('a, button, input[type="button"], input[type="submit"]').each((i, el) => {
  const text = $(el).text().trim().replace(/\s+/g, ' ');
  const href = $(el).attr('href') || '';
  const onclick = $(el).attr('onclick') || '';
  const id = $(el).attr('id') || '';
  const className = $(el).attr('class') || '';

  // Imprime tudo para a gente ver se tem algo suspeito
  if (/imprimir|pdf|print|relatorio|hist/i.test(text) || 
      /imprimir|pdf|print|relatorio|hist/i.test(href) || 
      /imprimir|pdf|print|relatorio|hist/i.test(onclick) ||
      /btn|print|pdf/i.test(className) ||
      /btn|print|pdf/i.test(id)) {
    console.log(`Elemento: ${el.name || el.tagName}`);
    console.log(`  Texto: "${text}"`);
    console.log(`  Href: "${href}"`);
    console.log(`  Onclick: "${onclick}"`);
    console.log(`  Id: "${id}" | Class: "${className}"`);
  }
});
