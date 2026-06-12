const fs = require('fs');
const cheerio = require('cheerio');

const html = (fs.existsSync('scratch/editar-31417.html') ? fs.readFileSync('scratch/editar-31417.html', 'utf8') : '') +
             (fs.existsSync('scratch/informacoes-31417.html') ? fs.readFileSync('scratch/informacoes-31417.html', 'utf8') : '');
const $ = cheerio.load(html);

console.log('--- BUSCANDO ROTAS DA FICHA GERAL EM selecionar-opcao ---');
$('*').each((i, el) => {
  const text = $(el).text().trim().replace(/\s+/g, ' ');
  const href = $(el).attr('href') || '';
  const action = $(el).attr('action') || '';
  const onclick = $(el).attr('onclick') || '';
  
  if (/ficha/i.test(href) || /ficha/i.test(action) || /ficha/i.test(onclick) || /ficha/i.test(text)) {
    console.log(`Elemento: ${el.name || el.tagName}`);
    console.log(`  Texto: "${text.substring(0, 100)}"`);
    if (href) console.log(`  Href: "${href}"`);
    if (action) console.log(`  Action: "${action}"`);
    if (onclick) console.log(`  Onclick: "${onclick}"`);
  }
});
