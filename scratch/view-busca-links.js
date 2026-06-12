const fs = require('fs');
const cheerio = require('cheerio');

const html = fs.readFileSync('scratch/busca-form.html', 'utf8');
const $ = cheerio.load(html);

console.log('--- BUSCANDO ROTAS E FORMULÁRIOS DE RELATÓRIOS ---');
$('form, a, button').each((i, el) => {
  const text = $(el).text().trim().replace(/\s+/g, ' ');
  const href = $(el).attr('href') || '';
  const action = $(el).attr('action') || '';
  const onclick = $(el).attr('onclick') || '';

  if (/ficha|geral|relat/i.test(href) || 
      /ficha|geral|relat/i.test(action) || 
      /ficha|geral|relat/i.test(text) ||
      /ficha|geral|relat/i.test(onclick)) {
    console.log(`Elemento: ${el.name || el.tagName}`);
    if (text) console.log(`  Texto: "${text}"`);
    if (href) console.log(`  Href: "${href}"`);
    if (action) console.log(`  Action: "${action}"`);
    if (onclick) console.log(`  Onclick: "${onclick}"`);
  }
});
